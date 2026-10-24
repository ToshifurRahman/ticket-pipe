import type { Hono } from 'hono';
import { createSession } from '../../src/lib/ops-session.js';
import request from './request.js';

// Signs in once with the test OPS_TOKEN (set in vitest.config.ts) and returns the
// `ops_session=<id>` pair to send back as a Cookie header.
let cached: Promise<string> | null = null;

export function opsCookie(app: Hono<any>): Promise<string> {
  cached ??= (async () => {
    const res = await request(app).post('/api/ops/session').send({ token: process.env.OPS_TOKEN });
    if (res.status !== 200) throw new Error(`Test sign-in failed with ${res.status}`);
    return res.headers['set-cookie'].split(';')[0];
  })();
  return cached;
}

/** `request(app)` that is already signed in as ops. */
export default function opsRequest(app: Hono<any>) {
  return request(app, async () => ({ cookie: await opsCookie(app) }));
}

/** A live session created straight in Redis, for socket tests that have no Hono app. */
export async function newOpsCookie(): Promise<string> {
  const { id } = await createSession();
  return `ops_session=${id}`;
}
