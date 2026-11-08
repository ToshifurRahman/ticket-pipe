import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import path from 'path';
import { fileURLToPath } from 'url';

import { TicketNotFoundError } from './domain/errors.js';
import { logger } from './lib/logger.js';
import { getEngine } from './lib/socket.js';
import { isOriginAllowed } from './middleware/origin-policy.js';
import { type AppEnv, requestLogger } from './middleware/request-logger.js';
import { securityHeaders } from './middleware/security-headers.js';
import { mountWebApp } from './middleware/web-app.js';
import { healthRouter } from './routes/health.js';
import { notificationsRouter } from './routes/notifications.js';
import { opsRouter } from './routes/ops.js';
import { opsSessionRouter } from './routes/ops-session.js';
import { ticketsRouter } from './routes/tickets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = new Hono<AppEnv>();

// First, so every response (page, asset, JSON, 404, 403, 413, 500) carries the headers.
app.use('*', securityHeaders);
app.use('*', requestLogger);

// A cross-site request is refused before any handler or body work. CORS alone would only hide
// the response; the server would still act on a cross-site POST.
const rejectForeignOrigin = createMiddleware<AppEnv>(async (c, next) => {
  if (!isOriginAllowed(c.req.header('origin'), c.req.header('host'))) {
    return c.json({ error: 'Origin not allowed' }, 403);
  }
  await next();
});

app.use('/api/*', rejectForeignOrigin);
// The site's own origin keeps working; any other Origin is refused before the issue is parsed.
app.use(
  '/api/*',
  cors({
    origin: (origin, c) => (isOriginAllowed(origin, c.req.header('host')) ? origin : undefined),
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  })
);
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
  // Browsers do not apply CORS to a websocket handshake, so this gate is what stops one.
  if (!isOriginAllowed(c.req.header('origin'), c.req.header('host'))) {
    return c.json({ error: 'Origin not allowed' }, 403);
  }
  const engine = getEngine();
  if (!engine) return c.text('Not Found', 404);
  return engine.handleRequest(c.req.raw, c.env as never);
});

app.route('/health', healthRouter);
app.route('/api/tickets', ticketsRouter);
app.route('/api/notifications', notificationsRouter);
// Mounted before /api/ops so sign-in is reachable without a session.
app.route('/api/ops/session', opsSessionRouter);
app.route('/api/ops', opsRouter);
mountWebApp(app, path.join(__dirname, '../../web/dist'));

app.onError((err, c) => {
  if (err instanceof TicketNotFoundError) return c.json({ error: 'Ticket not found' }, 404);
  // The validator throws a 400 for an unparseable JSON body.
  if (err instanceof HTTPException && err.status === 400)
    return c.json({ error: 'Invalid request body' }, 400);
  logger.error({ err }, 'Unhandled error');
  return c.json({ error: 'Internal server error' }, 500);
});

export { logger };
