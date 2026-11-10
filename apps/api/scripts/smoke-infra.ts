import {
  DeleteMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
  type SQSClientConfig,
} from '@aws-sdk/client-sqs';
import { GetCallerIdentityCommand, STSClient, type STSClientConfig } from '@aws-sdk/client-sts';
import pg from 'pg';
import { createClient } from 'redis';

import { type Config, pickConfig, type RawEnv } from '../src/lib/config.js';
import { smokeQueueName } from './queue-names.js';

const { Client } = pg;

// Per-check ceiling: one stalled dependency must not hide the rest of the report.
export const DEFAULT_CHECK_TIMEOUT_MS = 20_000;
const NETWORK_TIMEOUT_MS = 8000;
const CONNECT_TIMEOUT_MS = 5000;
const PING_TIMEOUT_MS = 5000;

const TIMED_OUT = Symbol('check timed out');

async function withDeadline<T>(work: Promise<T>, timeoutMs: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export const CHECK_NAMES = [
  'aws-identity',
  'aws-not-local',
  'sqs-round-trip',
  'postgres',
  'redis',
  'redis-tls',
] as const;

export type CheckName = (typeof CHECK_NAMES)[number];

export type SmokeChecks = {
  awsIdentity: () => boolean | Promise<boolean>;
  awsNotLocal: () => boolean | Promise<boolean>;
  sqsRoundTrip: () => boolean | Promise<boolean>;
  postgres: () => boolean | Promise<boolean>;
  redis: () => boolean | Promise<boolean>;
  redisTls: () => boolean | Promise<boolean>;
};

const CHECKS: ReadonlyArray<[CheckName, keyof SmokeChecks]> = [
  ['aws-identity', 'awsIdentity'],
  ['aws-not-local', 'awsNotLocal'],
  ['sqs-round-trip', 'sqsRoundTrip'],
  ['postgres', 'postgres'],
  ['redis', 'redis'],
  ['redis-tls', 'redisTls'],
];

/**
 * Runs every check and prints only `<name> ok` or `<name> WRONG`. An exception is a WRONG, and
 * its text is never printed: it can quote a URL, an ARN, an account id, a message id or a key.
 */
export async function runSmoke(
  checks: SmokeChecks,
  print: (line: string) => void = console.log,
  options: { timeoutMs?: number } = {}
): Promise<number> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
  let allOk = true;
  for (const [name, key] of CHECKS) {
    let ok: boolean;
    try {
      const result = await withDeadline(
        Promise.resolve().then(() => checks[key]()),
        timeoutMs
      );
      ok = result !== TIMED_OUT && result === true;
    } catch {
      ok = false;
    }
    print(`${name} ${ok ? 'ok' : 'WRONG'}`);
    if (!ok) allOk = false;
  }
  return allOk ? 0 : 1;
}

const KEYS = [
  'DATABASE_URL',
  'REDIS_URL',
  'SQS_QUEUE_NAME',
  'SQS_ENDPOINT',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
] as const;

type SmokeConfig = Pick<Config, (typeof KEYS)[number]>;
type AwsConfig = Pick<Config, 'AWS_REGION' | 'AWS_ACCESS_KEY_ID' | 'AWS_SECRET_ACCESS_KEY'>;
type SqsConfig = AwsConfig & Pick<Config, 'SQS_QUEUE_NAME' | 'SQS_ENDPOINT'>;
type PgConfig = Pick<Config, 'DATABASE_URL'>;

function hasEndpoint(endpoint: string | undefined): endpoint is string {
  return typeof endpoint === 'string' && endpoint.trim() !== '';
}

function sqsClientConfig(config: SqsConfig): SQSClientConfig {
  return {
    ...(hasEndpoint(config.SQS_ENDPOINT) ? { endpoint: config.SQS_ENDPOINT } : {}),
    region: config.AWS_REGION,
    credentials: {
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    },
    maxAttempts: 1,
    requestHandler: {
      requestTimeout: NETWORK_TIMEOUT_MS,
      connectionTimeout: CONNECT_TIMEOUT_MS,
      throwOnRequestTimeout: true,
    },
  };
}

export async function awsIdentity(
  config: AwsConfig,
  overrides: Partial<STSClientConfig> = {}
): Promise<boolean> {
  const sts = new STSClient({
    region: config.AWS_REGION,
    credentials: {
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    },
    maxAttempts: 1,
    requestHandler: {
      requestTimeout: NETWORK_TIMEOUT_MS,
      connectionTimeout: CONNECT_TIMEOUT_MS,
      throwOnRequestTimeout: true,
    },
    ...overrides,
  });
  try {
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    // An account root (or root-derived) identity is the one credential that must never run the app.
    return (
      typeof identity.Arn === 'string' && identity.Arn.length > 0 && !identity.Arn.endsWith(':root')
    );
  } finally {
    // A hung request must not keep its socket (and the process) alive.
    sts.destroy();
  }
}

export function smokeMessageBody(id: string): string {
  return JSON.stringify({ ticketId: id, referenceNumber: `SMOKE-${id.slice(0, 8)}` });
}

export async function sqsRoundTrip(config: SqsConfig): Promise<boolean> {
  const client = new SQSClient(sqsClientConfig(config));
  try {
    const { QueueUrl } = await client.send(
      new GetQueueUrlCommand({ QueueName: smokeQueueName(config.SQS_QUEUE_NAME) })
    );
    if (!QueueUrl) return false;

    const id = `smoke-${crypto.randomUUID()}`;
    const body = smokeMessageBody(id);
    // The app's JSON envelope, so a message left behind on failure is still parseable by
    // queue.ts receive() instead of throwing on every poll until redrive removes it.
    await client.send(new SendMessageCommand({ QueueUrl, MessageBody: body }));

    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await client.send(
        new ReceiveMessageCommand({
          QueueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 2,
        })
      );
      for (const message of result.Messages ?? []) {
        if (message.Body !== body) continue;
        if (!message.ReceiptHandle) return false;
        await client.send(
          new DeleteMessageCommand({ QueueUrl, ReceiptHandle: message.ReceiptHandle })
        );
        return true;
      }
    }
    return false;
  } finally {
    // A hung request must not keep its socket (and the process) alive.
    client.destroy();
  }
}

const TLS_MODES = new Set(['', 'require', 'verify-ca', 'verify-full']);

/**
 * Forces TLS itself instead of letting node-postgres negotiate from the URL: `prefer` and
 * `allow` fall back to plaintext, and any sslmode in the URL makes pg print a security warning
 * to stderr, which would break the ok/WRONG output contract. Unknown modes are refused, as are
 * `sslmode=disable` and `ssl=0`.
 */
export function postgresConnectionConfig(connectionString: string): {
  connectionString: string;
  ssl: { rejectUnauthorized: true };
} {
  const url = new URL(connectionString);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('not a postgres URL');
  }
  const mode = (url.searchParams.get('sslmode') ?? '').toLowerCase();
  const sslParam = (url.searchParams.get('ssl') ?? '').toLowerCase();
  if (!TLS_MODES.has(mode) || sslParam === '0' || sslParam === 'false') {
    throw new Error('TLS is required');
  }
  url.searchParams.delete('sslmode');
  url.searchParams.delete('ssl');
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: true } };
}

interface PgClientInternals {
  connection?: { stream?: { destroy(): void } };
}

function destroyPgSocket(client: PostgresClientLike): void {
  (client as unknown as PgClientInternals).connection?.stream?.destroy();
}

export interface PostgresClientLike {
  on(event: 'error', listener: () => void): unknown;
  connect(): Promise<unknown>;
  query(sql: string): Promise<unknown>;
  end(): Promise<void>;
  connection?: { stream?: { destroy(): void } };
}

export interface PostgresCheckOptions {
  createClient?: (config: pg.ClientConfig) => PostgresClientLike;
  closeTimeoutMs?: number;
}

export async function postgresCheck(
  config: PgConfig,
  options: PostgresCheckOptions = {}
): Promise<boolean> {
  const createClient =
    options.createClient ?? ((clientConfig: pg.ClientConfig) => new Client(clientConfig));
  const client = createClient({
    ...postgresConnectionConfig(config.DATABASE_URL),
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: NETWORK_TIMEOUT_MS,
    statement_timeout: NETWORK_TIMEOUT_MS,
  });
  // A late socket error after connect() would otherwise be an unhandled 'error' event and a raw
  // stack trace on stderr, outside runSmoke's catch.
  client.on('error', () => undefined);
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } finally {
    const closed = await withDeadline(
      client.end().catch(() => undefined),
      options.closeTimeoutMs ?? CONNECT_TIMEOUT_MS
    );
    // A graceful end waits for the peer's close; destroy the socket when that never arrives.
    if (closed === TIMED_OUT) destroyPgSocket(client);
  }
}

export async function redisCheck(config: Pick<SmokeConfig, 'REDIS_URL'>): Promise<boolean> {
  const client = createClient({
    url: config.REDIS_URL,
    // Without this, node-redis retries forever on an unreachable host and the check hangs.
    socket: { reconnectStrategy: false, connectTimeout: CONNECT_TIMEOUT_MS },
  });
  // node-redis emits 'error' before connect() rejects; with no listener Node throws the raw
  // error text (including the URL) to stderr and crashes outside runSmoke's catch.
  client.on('error', () => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await client.connect();
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('ping timed out')), PING_TIMEOUT_MS);
    });
    try {
      return (await Promise.race([client.ping(), timedOut])) === 'PONG';
    } finally {
      clearTimeout(timer);
    }
  } finally {
    // Destroy instead of quit: a stalled server would make quit() hang too.
    client.destroy();
  }
}

function redisTls(config: SmokeConfig): boolean {
  return new URL(config.REDIS_URL).protocol === 'rediss:';
}

const FAILED = () => false;

function failedChecks(): SmokeChecks {
  return {
    awsIdentity: FAILED,
    awsNotLocal: FAILED,
    sqsRoundTrip: FAILED,
    postgres: FAILED,
    redis: FAILED,
    redisTls: FAILED,
  };
}

export function defaultChecks(env?: RawEnv): SmokeChecks {
  let config: SmokeConfig;
  try {
    // pickConfig throws instead of printing and exiting, so a bad environment stays inside
    // the ok/WRONG contract and never writes a value or an error to stderr.
    config = pickConfig(KEYS, {}, env);
  } catch {
    return failedChecks();
  }
  return {
    awsIdentity: () => awsIdentity(config),
    awsNotLocal: () => !hasEndpoint(config.SQS_ENDPOINT),
    sqsRoundTrip: () => sqsRoundTrip(config),
    postgres: () => postgresCheck(config),
    redis: () => redisCheck(config),
    redisTls: () => redisTls(config),
  };
}

if (import.meta.main) {
  process.exit(await runSmoke(defaultChecks()));
}
