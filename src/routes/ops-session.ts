import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import {
  checkOpsToken,
  createSession,
  destroySession,
  isOpsSignInConfigured,
  isSignInLocked,
  lookupSession,
  OPS_SESSION_COOKIE,
  recordFailedSignIn,
  SESSION_TTL_S,
} from '../lib/ops-session.js';
import { revokeOpsSockets } from '../lib/socket.js';

export const opsSessionRouter = new Hono();

const SignInSchema = z.object({ token: z.string().max(512) });

// Behind Render's proxy the caller's address is the last hop it appended to X-Forwarded-For;
// earlier hops are client-supplied. Locally there is no proxy and the header is absent.
function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const hops = (c.req.header('x-forwarded-for') ?? '').split(',').map((hop) => hop.trim()).filter(Boolean);
  return hops.at(-1) ?? 'local';
}

opsSessionRouter.post('/', zValidator('json', SignInSchema, (result, c) => (result.success ? undefined : c.json({ error: 'Invalid request body' }, 400))), async (c) => {
  if (!isOpsSignInConfigured()) return c.json({ error: 'Ops sign-in is not configured' }, 503);

  const ip = clientIp(c);
  if (await isSignInLocked(ip)) return c.json({ error: 'Too many attempts, try again later' }, 429);

  if (!checkOpsToken(c.req.valid('json').token)) {
    await recordFailedSignIn(ip);
    return c.json({ error: 'Invalid token' }, 401);
  }

  const { id, expiresAt } = await createSession();
  setCookie(c, OPS_SESSION_COOKIE, id, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: SESSION_TTL_S,
  });
  return c.json({ signedIn: true, expiresAt });
});

// Never a 401: the console asks this to decide whether to show the sign-in card.
opsSessionRouter.get('/', async (c) => {
  const session = await lookupSession(getCookie(c, OPS_SESSION_COOKIE));
  return c.json(session ? { signedIn: true, expiresAt: session.expiresAt } : { signedIn: false });
});

opsSessionRouter.delete('/', async (c) => {
  const id = getCookie(c, OPS_SESSION_COOKIE);
  if (id) {
    const hash = await destroySession(id);
    await revokeOpsSockets(hash);
  }
  deleteCookie(c, OPS_SESSION_COOKIE, { path: '/', secure: true, sameSite: 'Strict' });
  return c.body(null, 204);
});
