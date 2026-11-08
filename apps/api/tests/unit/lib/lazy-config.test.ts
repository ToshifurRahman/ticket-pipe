/**
 * Modules build their clients on first use, from getConfig(). Importing them never reads or
 * validates the environment, so an entry point can validate first and exit with a clear message.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pools: [] as Array<{ options: unknown; query: unknown; end: unknown }>,
  sqsClients: [] as unknown[],
  getConfig: vi.fn(),
}));

// Calls through to the real getConfig(); only counts the calls.
vi.mock('../../../src/lib/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/config.js')>();
  mocks.getConfig.mockImplementation(actual.getConfig);
  return { ...actual, getConfig: mocks.getConfig };
});

vi.mock('pg', () => {
  class Pool {
    query = vi.fn(() => Promise.resolve({ rows: [] }));
    end = vi.fn(() => Promise.resolve());
    on = vi.fn();
    constructor(public options: unknown) {
      mocks.pools.push(this);
    }
  }
  return { default: { Pool } };
});

vi.mock('@aws-sdk/client-sqs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-sqs')>();
  class SQSClient {
    send = vi.fn(() => Promise.resolve({ QueueUrl: 'http://queue' }));
    constructor(public options: unknown) {
      mocks.sqsClients.push(this);
    }
  }
  return { ...actual, SQSClient };
});

const MODULES = [
  '../../../src/lib/db.js',
  '../../../src/lib/queue.js',
  '../../../src/lib/socket.js',
  '../../../src/lib/sns.js',
  '../../../src/lib/mailer.js',
  '../../../src/lib/counters.js',
  '../../../src/lib/llm-client.js',
  '../../../src/lib/ops-session.js',
  '../../../src/lib/turnstile.js',
  '../../../src/services/ops-alerts.js',
  '../../../src/services/customer-notifications.js',
];

beforeEach(() => {
  mocks.pools.length = 0;
  mocks.sqsClients.length = 0;
  vi.resetModules();
});

describe('importing modules with an empty environment', () => {
  it.each(MODULES)('%s does not throw', async (file) => {
    const saved = { ...process.env };
    for (const key of Object.keys(process.env)) delete process.env[key];
    try {
      await expect(import(file)).resolves.toBeDefined();
    } finally {
      Object.assign(process.env, saved);
    }
  });
});

describe('db pool', () => {
  it('builds one Pool from DATABASE_URL on first use and reuses it', async () => {
    const { pool } = await import('../../../src/lib/db.js');
    expect(mocks.pools).toHaveLength(0);
    await pool.query('select 1');
    await pool.query('select 2');
    await pool.end();
    expect(mocks.pools).toHaveLength(1);
    expect(mocks.pools[0].options).toEqual({ connectionString: process.env.DATABASE_URL });
    expect(mocks.pools[0].query).toHaveBeenCalledTimes(2);
    expect(mocks.pools[0].end).toHaveBeenCalledTimes(1);
  });

  it('looks like a pg.Pool: instanceof, in and method binding', async () => {
    const { default: pg } = await import('pg');
    const { pool } = await import('../../../src/lib/db.js');
    expect(pool instanceof pg.Pool).toBe(true);
    expect('on' in pool).toBe(true);
    expect('nope' in pool).toBe(false);
    pool.on('error', () => undefined);
    expect(mocks.pools).toHaveLength(1);
  });
});

describe('turnstile verifier', () => {
  it('does not read the environment when it is imported', async () => {
    mocks.getConfig.mockClear();
    await import('../../../src/lib/turnstile.js');
    expect(mocks.getConfig).not.toHaveBeenCalled();
  });
});

describe('queue service', () => {
  it('builds one QueueService on the first call and reuses it', async () => {
    const { enqueueTicket } = await import('../../../src/lib/queue.js');
    expect(mocks.sqsClients).toHaveLength(0);
    await enqueueTicket('t1', 'REF-1');
    await enqueueTicket('t2', 'REF-2');
    expect(mocks.sqsClients).toHaveLength(1);
    const client = mocks.sqsClients[0] as { options: Record<string, unknown>; send: unknown };
    expect(client.options).toMatchObject({
      endpoint: process.env.SQS_ENDPOINT,
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    // GetQueueUrl once, then one send per ticket.
    expect(client.send).toHaveBeenCalledTimes(3);
  });
});

describe('ops alerter', () => {
  it('is built once, on the first alert', async () => {
    mocks.getConfig.mockClear();
    const getConfig = mocks.getConfig;
    vi.doMock('../../../src/lib/sns.js', () => ({ getSnsClient: () => null }));
    const { alertNeedsAttention, pendingAlerts } =
      await import('../../../src/services/ops-alerts.js');
    expect(getConfig).not.toHaveBeenCalled();
    const alert = { ticketId: 't', referenceNumber: 'R', reason: 'x' } as never;
    alertNeedsAttention(alert);
    alertNeedsAttention(alert);
    await pendingAlerts();
    expect(getConfig).toHaveBeenCalledTimes(1);
    vi.doUnmock('../../../src/lib/sns.js');
  });
});
