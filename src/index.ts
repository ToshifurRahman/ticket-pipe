import { createServer } from 'http';
import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './lib/logger.js';
import { ticketsRouter } from './routes/tickets.js';
import { healthRouter } from './routes/health.js';
import { init as initSocket } from './lib/socket.js';
import { TicketNotFoundError } from './lib/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/health', healthRouter);
app.use('/api/tickets', ticketsRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof TicketNotFoundError) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

if (process.argv[1] === __filename) {
  const port = Number(process.env.PORT ?? 3000);
  const httpServer = createServer(app);
  initSocket(httpServer);
  httpServer.listen(port, () => {
    logger.info({ port }, 'Server started');
  });
}

export { app, logger };
