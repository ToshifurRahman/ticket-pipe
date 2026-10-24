import { createMiddleware } from 'hono/factory';
import { logger } from './logger.js';

export type AppEnv = { Variables: { requestId: string } };

// One structured line per request, tagged with a request id (the caller's `x-request-id`
// when present) that is echoed back so a client report can be matched to a log line.
// Health checks are logged at debug: orchestrators poll them constantly.
export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = c.req.header('x-request-id') ?? crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);
  const start = performance.now();
  await next();
  const level = c.req.path === '/health' ? 'debug' : 'info';
  logger[level](
    {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - start),
    },
    'request'
  );
});
