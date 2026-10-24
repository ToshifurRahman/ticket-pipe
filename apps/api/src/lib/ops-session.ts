import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { createClient } from 'redis';
import { logger } from './logger.js';

export const OPS_SESSION_COOKIE = 'ops_session';
// A fixed lifetime: the Redis TTL and the cookie's Max-Age are the same and never extended.
export const SESSION_TTL_S = 12 * 60 * 60;

const MIN_PRODUCTION_TOKEN_LENGTH = 32;
const MAX_FAILED_SIGN_INS = 5;
const SIGN_IN_WINDOW_S = 15 * 60;

const sessionKey = (hash: string) => `ops:session:${hash}`;
const failureKey = (ip: string) => `ops:signin-fail:${ip}`;

export const hashSessionId = (id: string) => createHash('sha256').update(id).digest('hex');

export interface OpsSession {
  /** What Redis is keyed by. Never the cookie value itself. */
  hash: string;
  expiresAt: Date;
}

// Only what this module calls. createClient()'s generics don't line up across call sites
// (see the note in socket.ts), so the client is tracked structurally.
interface SessionRedis {
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  get(key: string): Promise<string | null>;
  pTTL(key: string): Promise<number>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  quit(): Promise<unknown>;
}
let client: SessionRedis | null = null;

// Its own lazily opened connection: the Socket.IO clients are for pub/sub only.
function redis(): SessionRedis {
  if (!client) {
    if (!process.env.REDIS_URL) throw new Error('REDIS_URL environment variable is required');
    const created = createClient({ url: process.env.REDIS_URL });
    created.on('error', (err) => logger.error({ err }, 'Redis ops-session client error'));
    client = created as unknown as SessionRedis;
    void created.connect().catch((err) => logger.error({ err }, 'Redis ops-session client failed to connect'));
  }
  return client;
}

export async function closeOpsSessionStore(): Promise<void> {
  const current = client;
  client = null;
  if (current) await Promise.allSettled([current.quit()]);
}

/** In production the token must be set and long enough that guessing is infeasible. */
export function assertOpsTokenConfigured(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const token = process.env.OPS_TOKEN;
  if (!token || token.length < MIN_PRODUCTION_TOKEN_LENGTH) {
    throw new Error(`OPS_TOKEN must be set to at least ${MIN_PRODUCTION_TOKEN_LENGTH} characters in production`);
  }
}

export const isOpsSignInConfigured = () => Boolean(process.env.OPS_TOKEN);

// Hashing first gives both sides the same length, which timingSafeEqual requires.
export function checkOpsToken(candidate: string): boolean {
  const expected = process.env.OPS_TOKEN;
  if (!expected) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}

export async function createSession(): Promise<{ id: string; expiresAt: Date }> {
  const id = randomBytes(32).toString('base64url');
  await redis().set(sessionKey(hashSessionId(id)), JSON.stringify({ createdAt: Date.now() }), { EX: SESSION_TTL_S });
  return { id, expiresAt: new Date(Date.now() + SESSION_TTL_S * 1000) };
}

export async function lookupSession(id: string | undefined): Promise<OpsSession | null> {
  if (!id) return null;
  const hash = hashSessionId(id);
  const ttlMs = await redis().pTTL(sessionKey(hash));
  // -2: no such key. -1: a key with no expiry, which this module never writes.
  if (ttlMs <= 0) return null;
  return { hash, expiresAt: new Date(Date.now() + ttlMs) };
}

export async function destroySession(id: string): Promise<string> {
  const hash = hashSessionId(id);
  await redis().del(sessionKey(hash));
  return hash;
}

export function sessionIdFromCookieHeader(header: string | undefined): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === OPS_SESSION_COOKIE) return part.slice(eq + 1).trim() || undefined;
  }
  return undefined;
}

export async function isSignInLocked(ip: string): Promise<boolean> {
  const count = Number(await redis().get(failureKey(ip)));
  return count >= MAX_FAILED_SIGN_INS;
}

export async function recordFailedSignIn(ip: string): Promise<void> {
  const key = failureKey(ip);
  const count = await redis().incr(key);
  // The window starts at the first failure; later ones don't extend it.
  if (count === 1) await redis().expire(key, SIGN_IN_WINDOW_S);
}
