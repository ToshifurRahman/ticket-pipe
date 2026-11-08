import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('redis', () => {
  const client = () => ({
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    duplicate: vi.fn(() => client()),
    publish: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue(undefined),
  });
  return { createClient: vi.fn(client) };
});

import { bunEngineOptions, getEmitter, nodeTransportOptions } from '../../../src/lib/socket.js';

describe('getEmitter', () => {
  it('returns the same emitter instance on repeated calls (lazy singleton)', () => {
    const first = getEmitter();
    const second = getEmitter();
    expect(first).toBe(second);
  });
});

describe('Node transport origin gate', () => {
  it('refuses a foreign Origin, accepts the site Origin and advertises only that Origin', async () => {
    const httpServer = createServer();
    const io = new Server(httpServer, nodeTransportOptions());
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
    const { port } = httpServer.address() as AddressInfo;
    const base = `http://localhost:${port}`;

    const connectResult = (origin: string) =>
      new Promise<string>((resolve, reject) => {
        const client = ioClient(base, {
          transports: ['websocket'],
          reconnection: false,
          forceNew: true,
          extraHeaders: { Origin: origin },
        });
        const timer = setTimeout(() => {
          client.disconnect();
          reject(new Error('no connect or connect_error'));
        }, 5000);
        client.once('connect', () => {
          clearTimeout(timer);
          client.disconnect();
          resolve('connected');
        });
        client.once('connect_error', (err) => {
          clearTimeout(timer);
          client.disconnect();
          resolve(`refused: ${err.message}`);
        });
      });

    try {
      expect(await connectResult('https://evil.test')).toMatch(/^refused: /);
      expect(await connectResult(base)).toBe('connected');

      // The cors callback is what puts the header on the handshake; '*' would fail this.
      const handshake = await fetch(`${base}/socket.io/?EIO=4&transport=polling`, {
        headers: { origin: base },
      });
      expect(handshake.status).toBe(200);
      expect(handshake.headers.get('access-control-allow-origin')).toBe(base);
    } finally {
      await new Promise<void>((resolve) => {
        void io.close(() => resolve());
      });
    }
  }, 20_000);
});

describe('Bun engine origin gate', () => {
  const request = (origin?: string) =>
    new Request('http://localhost/socket.io/', origin ? { headers: { origin } } : undefined);

  it('rejects a foreign Origin', async () => {
    await expect(bunEngineOptions().allowRequest(request('https://evil.test'))).rejects.toThrow(
      'Origin not allowed'
    );
  });

  it('resolves the site Origin and a request with no Origin', async () => {
    await expect(
      bunEngineOptions().allowRequest(request('http://localhost:3100'))
    ).resolves.toBeUndefined();
    await expect(bunEngineOptions().allowRequest(request())).resolves.toBeUndefined();
  });
});
