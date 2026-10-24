/**
 * The production server path, which no other test runs: the real `src/index.ts` booted under
 * Bun, so Socket.IO is bound to @socket.io/bun-engine and served by Bun.serve. Everything
 * else runs under Node, where the engine cannot load.
 *
 * Delivery is checked the way production does it: this process publishes through the Redis
 * emitter (what the worker uses) and a real client connected to the Bun server receives it.
 *
 * Requires `bun` on PATH and the docker-compose stack (Postgres, Redis, LocalStack).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { createServer } from 'net';
import { io as ioClient, type Socket } from 'socket.io-client';
import { getEmitter, warmEmitter, shutdown as shutdownSocket } from '../src/lib/socket.js';

let proc: ChildProcess;
let base: string;
let output = '';
const clients: Socket[] = [];

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHealth(url: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`Bun server exited early (${proc.exitCode}):\n${output}`);
    try {
      if ((await fetch(`${url}/health`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Bun server did not become healthy:\n${output}`);
}

function connect(): Promise<Socket> {
  const client = ioClient(base, { transports: ['websocket'], reconnection: false });
  clients.push(client);
  return new Promise((resolve, reject) => {
    client.once('connect', () => resolve(client));
    client.once('connect_error', reject);
  });
}

beforeAll(async () => {
  const port = await freePort();
  base = `http://localhost:${port}`;
  proc = spawn('bun', ['src/index.ts'], {
    env: { ...process.env, PORT: String(port), LLM_MODE: 'fake' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout!.on('data', (chunk) => (output = (output + chunk).slice(-4000)));
  proc.stderr!.on('data', (chunk) => (output = (output + chunk).slice(-4000)));
  await waitForHealth(base);
  // The emitter drops anything published before it has connected.
  await warmEmitter();
}, 30_000);

afterAll(async () => {
  for (const client of clients) client.disconnect();
  if (proc && proc.exitCode === null) {
    const exited = new Promise((resolve) => proc.once('exit', resolve));
    proc.kill('SIGTERM');
    // A graceful SIGTERM exit takes well under a second; never let a hung child stall the run.
    const killer = setTimeout(() => proc.kill('SIGKILL'), 5000);
    await exited;
    clearTimeout(killer);
  }
  await shutdownSocket();
}, 20_000);

describe('Bun server', () => {
  it('serves the HTTP API', async () => {
    const res = await fetch(`${base}/api/nope`, { headers: { accept: 'text/html' } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
    expect((await fetch(`${base}/health`)).headers.get('x-request-id')).toBeTruthy();
  });

  it('delivers a worker-style Redis emit to a client in the ticket room', async () => {
    const ticketId = crypto.randomUUID();
    const client = await connect();
    const received = new Promise<Record<string, unknown>>((resolve) => client.on('ticket:update', resolve));

    client.emit('join', ticketId);
    // Events on one socket are handled in order, so once this ack returns the join is done.
    await client.timeout(5000).emitWithAck('ops:subscribe');

    getEmitter().to(ticketId).emit('ticket:update', { event: 'ticket.completed', ticketId });

    const payload = await Promise.race([
      received,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('no ticket:update delivered')), 5000)),
    ]);
    expect(payload).toEqual({ event: 'ticket.completed', ticketId });
  });

  it('does not deliver another ticket\'s events', async () => {
    const mine = crypto.randomUUID();
    const client = await connect();
    const got: unknown[] = [];
    client.on('ticket:update', (p) => got.push(p));

    client.emit('join', mine);
    await client.timeout(5000).emitWithAck('ops:subscribe');

    getEmitter().to(crypto.randomUUID()).emit('ticket:update', { event: 'other' });
    getEmitter().to(mine).emit('ticket:update', { event: 'mine' });
    await new Promise((r) => setTimeout(r, 500));

    expect(got).toEqual([{ event: 'mine' }]);
  });
});
