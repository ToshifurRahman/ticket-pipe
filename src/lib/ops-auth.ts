import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { lookupSession, OPS_SESSION_COOKIE, type OpsSession } from './ops-session.js';

// Staff-only routes. No session: 401 and nothing else, so no ticket data leaks.
export const requireOpsSession = createMiddleware<{ Variables: { opsSession: OpsSession } }>(async (c, next) => {
  const session = await lookupSession(getCookie(c, OPS_SESSION_COOKIE));
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  c.set('opsSession', session);
  await next();
});
