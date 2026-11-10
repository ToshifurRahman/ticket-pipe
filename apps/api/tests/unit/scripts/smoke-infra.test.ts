import { EventEmitter } from 'node:events';
import { createServer, type Server, type Socket } from 'node:net';

import { describe, expect, it, vi } from 'vitest';

import {
  awsIdentity,
  CHECK_NAMES,
  defaultChecks,
  postgresCheck,
  type PostgresClientLike,
  postgresConnectionConfig,
  redisCheck,
  runSmoke,
  type SmokeChecks,
  smokeMessageBody,
  sqsRoundTrip,
} from '../../../scripts/smoke-infra.js';

const URL_WITH_SECRET = 'postgresql://user:fake-secret-value@db.example:5432/db';
const KEY = 'fake-secret-value';
const ARN = 'arn:aws:iam::123456789012:user/smoke';

const LOCAL_AWS = {
  SQS_QUEUE_NAME: 'tickets',
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'test',
  AWS_SECRET_ACCESS_KEY: 'test',
};

async function listen(
  handler: (socket: Socket) => void
): Promise<{ server: Server; port: number; sockets: Set<Socket> }> {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    // Consume inbound bytes so a peer FIN is observed; without this the readable side stays
    // paused and the accepted socket can look open after the client closed.
    socket.resume();
    handler(socket);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return { server, port: address.port, sockets };
}

async function close(server: Server, sockets: Set<Socket>): Promise<void> {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function expectNoOpenSockets(server: Server): Promise<void> {
  const started = Date.now();
  let open = Number.POSITIVE_INFINITY;
  while (open > 0 && Date.now() - started < 5000) {
    open = await new Promise<number>((resolve, reject) =>
      server.getConnections((err, count) => (err ? reject(err) : resolve(count)))
    );
    if (open > 0) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(open).toBe(0);
}

function ok(): SmokeChecks {
  return {
    awsIdentity: () => true,
    awsNotLocal: () => true,
    sqsRoundTrip: () => true,
    postgres: () => true,
    redis: () => true,
    redisTls: () => true,
  };
}

function capture(): { lines: string[]; print: (line: string) => void } {
  const lines: string[] = [];
  return { lines, print: (line) => lines.push(line) };
}

describe('smoke-infra output', () => {
  it('prints one ok line per check and exits 0 when everything passes', async () => {
    const { lines, print } = capture();
    const code = await runSmoke(ok(), print);

    expect(code).toBe(0);
    expect(lines).toEqual(CHECK_NAMES.map((name) => `${name} ok`));
  });

  it('prints WRONG, no error text, and exits non-zero when a check throws', async () => {
    const { lines, print } = capture();
    const checks = ok();
    checks.postgres = () => {
      throw new Error(`connect failed: ${URL_WITH_SECRET}`);
    };
    checks.redis = () => {
      throw new Error(`AUTH failed with ${KEY} for ${ARN}`);
    };

    const code = await runSmoke(checks, print);

    expect(code).toBe(1);
    const output = lines.join('\n');
    expect(output).toContain('postgres WRONG');
    expect(output).toContain('redis WRONG');
    expect(output).not.toContain(URL_WITH_SECRET);
    expect(output).not.toContain(KEY);
    expect(output).not.toContain(ARN);
    expect(output).not.toContain('connect failed');
    expect(output).not.toContain('AUTH failed');
    expect(lines).toHaveLength(CHECK_NAMES.length);
  });

  it('reports a false check as WRONG without throwing', async () => {
    const { lines, print } = capture();
    const checks = ok();
    checks.awsIdentity = () => false;

    expect(await runSmoke(checks, print)).toBe(1);
    expect(lines).toContain('aws-identity WRONG');
  });
});

describe('smoke-infra redis failure', () => {
  it('prints only redis WRONG when the connection fails, with no raw error text', async () => {
    const { lines, print } = capture();
    const checks = ok();
    checks.redis = () => redisCheck({ REDIS_URL: 'redis://127.0.0.1:1' });

    const code = await runSmoke(checks, print);

    expect(code).toBe(1);
    expect(lines).toContain('redis WRONG');
    const output = lines.join('\n');
    expect(output).not.toContain('127.0.0.1');
    expect(output).not.toContain('ECONNREFUSED');
    expect(output).not.toContain('error');
  });
});

describe('smoke-infra postgres TLS', () => {
  const base = 'postgresql://user:fake-secret-value@db.example:5432/db';

  it.each(['disable', 'prefer', 'allow', 'no-verify'])('reports sslmode=%s as WRONG', (mode) => {
    expect(() => postgresConnectionConfig(`${base}?sslmode=${mode}`)).toThrow();
  });

  it('reports ssl=0 as WRONG', () => {
    expect(() => postgresConnectionConfig(`${base}?ssl=0`)).toThrow();
  });

  it.each(['require', 'verify-ca', 'verify-full'])(
    'accepts sslmode=%s and strips it so pg prints no security warning',
    (mode) => {
      const config = postgresConnectionConfig(`${base}?sslmode=${mode}`);
      expect(config.connectionString).not.toContain('sslmode');
      expect(config.ssl).toEqual({ rejectUnauthorized: true });
    }
  );

  it('accepts a URL with no ssl parameters and still forces TLS', () => {
    const config = postgresConnectionConfig(base);
    expect(config.connectionString).toBe(base);
    expect(config.ssl).toEqual({ rejectUnauthorized: true });
  });
});

describe('smoke-infra configuration and message shape', () => {
  it('prints only WRONG for a bad environment, with no raw error or value', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { lines, print } = capture();
      const code = await runSmoke(defaultChecks({ PORT: 'fake-secret-value' }), print);

      expect(code).toBe(1);
      expect(lines).toEqual(CHECK_NAMES.map((name) => `${name} WRONG`));
      expect(error).not.toHaveBeenCalled();
      expect(lines.join('\n')).not.toContain('fake-secret-value');
    } finally {
      error.mockRestore();
    }
  });

  it('sends the smoke id inside the app queue JSON envelope', () => {
    const body = smokeMessageBody('smoke-12345678');
    expect(JSON.parse(body)).toEqual({
      ticketId: 'smoke-12345678',
      referenceNumber: 'SMOKE-smoke-12',
    });
  });

  it('stops waiting for a stalled check and still runs the remaining ones', async () => {
    const { lines, print } = capture();
    const checks = ok();
    checks.postgres = () => new Promise<boolean>(() => undefined);

    const code = await runSmoke(checks, print, { timeoutMs: 20 });

    expect(code).toBe(1);
    expect(lines).toContain('postgres WRONG');
    expect(lines).toHaveLength(CHECK_NAMES.length);
    expect(lines.at(-1)).toBe('redis-tls ok');
  });
});

describe('smoke-infra stalled AWS endpoints', () => {
  async function expectStalled(
    check: (port: number) => () => Promise<boolean>,
    name: string
  ): Promise<void> {
    const { server, port, sockets } = await listen(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const started = Date.now();
    try {
      const { lines, print } = capture();
      const checks = ok();
      checks[name === 'aws-identity' ? 'awsIdentity' : 'sqsRoundTrip'] = check(port);

      const code = await runSmoke(checks, print, { timeoutMs: 15_000 });

      expect(code).toBe(1);
      expect(lines).toContain(`${name} WRONG`);
      expect(Date.now() - started).toBeLessThan(15_000);
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      await expectNoOpenSockets(server);
    } finally {
      warn.mockRestore();
      error.mockRestore();
      await close(server, sockets);
    }
  }

  it('times out a stalled SQS endpoint without warnings or open sockets', async () => {
    await expectStalled(
      (port) => () => sqsRoundTrip({ ...LOCAL_AWS, SQS_ENDPOINT: `http://127.0.0.1:${port}` }),
      'sqs-round-trip'
    );
  });

  it('times out a stalled STS endpoint without warnings or open sockets', async () => {
    await expectStalled(
      (port) => () => awsIdentity(LOCAL_AWS, { endpoint: `http://127.0.0.1:${port}` }),
      'aws-identity'
    );
  });
});

describe('smoke-infra postgres safeguards', () => {
  const config = { DATABASE_URL: 'postgresql://user:pass@db.example:5432/db' };

  // pg's own client cannot be driven into a late socket error or a stalled graceful end without
  // implementing the PostgreSQL wire protocol, so these two drive the same client surface with
  // an EventEmitter-backed fake. The real client is used everywhere else.
  class FakeClient extends EventEmitter implements PostgresClientLike {
    destroyed = false;
    connection = {
      stream: {
        destroy: () => {
          this.destroyed = true;
        },
      },
    };
    connect(): Promise<void> {
      return Promise.resolve();
    }
    end(): Promise<void> {
      return Promise.resolve();
    }
    query(): Promise<unknown> {
      return Promise.resolve([]);
    }
  }

  it('swallows a late postgres error so only the expected line is printed', async () => {
    const client = new FakeClient();
    client.query = () => {
      setTimeout(() => client.emit('error', new Error('connection reset')), 5);
      return Promise.resolve([]);
    };
    const { lines, print } = capture();
    const checks = ok();
    checks.postgres = () => postgresCheck(config, { createClient: () => client });

    const code = await runSmoke(checks, print);
    // Let the deferred 'error' fire; without a listener it is an uncaught exception.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(code).toBe(0);
    expect(lines).toContain('postgres ok');
  });

  it('bounds a stalled end and destroys the socket', async () => {
    const client = new FakeClient();
    client.end = () => new Promise<void>(() => undefined);
    const started = Date.now();

    const ok = await postgresCheck(config, { createClient: () => client, closeTimeoutMs: 20 });

    expect(ok).toBe(true);
    expect(client.destroyed).toBe(true);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
