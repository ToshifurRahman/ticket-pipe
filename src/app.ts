import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import path from 'path';
import { fileURLToPath } from 'url';
import { TicketNotFoundError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { requestLogger, type AppEnv } from './lib/request-logger.js';
import { getEngine } from './lib/socket.js';
import { mountWebApp } from './lib/web-app.js';
import { healthRouter } from './routes/health.js';
import { opsRouter } from './routes/ops.js';
import { opsSessionRouter } from './routes/ops-session.js';
import { ticketsRouter } from './routes/tickets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = new Hono<AppEnv>();

app.use('*', requestLogger);
// Same ceiling the old express.json() enforced.
app.use(
  '/api/*',
  bodyLimit({
    maxSize: 100 * 1024,
    onError: (c) => c.json({ error: 'Payload too large' }, 413),
  })
);

// Socket.IO's Bun engine owns this path; Bun.serve passes its server as `c.env`, which the
// engine needs to upgrade websockets (see server.ts).
app.all('/socket.io/', (c) => {
  const engine = getEngine();
  if (!engine) return c.text('Not Found', 404);
  return engine.handleRequest(c.req.raw, c.env as never);
});

app.route('/health', healthRouter);
app.route('/api/tickets', ticketsRouter);
// Mounted before /api/ops so sign-in is reachable without a session.
app.route('/api/ops/session', opsSessionRouter);
app.route('/api/ops', opsRouter);
mountWebApp(app, path.join(__dirname, '../web/dist'));

app.onError((err, c) => {
  if (err instanceof TicketNotFoundError) return c.json({ error: 'Ticket not found' }, 404);
  // The validator throws a 400 for an unparseable JSON body.
  if (err instanceof HTTPException && err.status === 400) return c.json({ error: 'Invalid request body' }, 400);
  logger.error({ err }, 'Unhandled error');
  return c.json({ error: 'Internal server error' }, 500);
});

export { logger };
