import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer, type Server } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { TicketNotFoundError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { init as initSocket, shutdown as shutdownSocket } from './lib/socket.js';
import { healthRouter } from './routes/health.js';
import { opsRouter } from './routes/ops.js';
import { ticketsRouter } from './routes/tickets.js';
import { assertLlmModeAllowed } from './lib/llm-client.js';
import { apiNotFound, mountWebApp } from './lib/web-app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

app.use('/health', healthRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/ops', opsRouter);
app.use('/api', apiNotFound);
mountWebApp(app, path.join(__dirname, '../web/dist'));

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof TicketNotFoundError) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

// Without this the Redis pub/sub clients are never closed and the process has to be
// killed rather than asked to stop. Guarded by `closing` so a second Ctrl-C while the
// first shutdown is still draining doesn't start a second one.
function installShutdownHandlers(httpServer: Server): void {
  let closing = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      if (closing) return;
      closing = true;
      logger.info({ signal }, 'Shutting down');
      void shutdownSocket()
        .catch((err) => logger.error({ err }, 'Error shutting down socket.io / Redis'))
        .finally(() => httpServer.close(() => process.exit(0)));
    });
  }
}

if (process.argv[1] === __filename) {
  assertLlmModeAllowed();
  const port = Number(process.env.PORT ?? 3000);
  const httpServer = createServer(app);
  initSocket(httpServer)
    .then(() => {
      httpServer.listen(port, () => {
        logger.info({ port }, 'Server started');
      });
      installShutdownHandlers(httpServer);
    })
    .catch((err) => {
      logger.error({ err }, 'Failed to initialize socket.io / Redis adapter');
      process.exitCode = 1;
    });
}

export { app, logger };
