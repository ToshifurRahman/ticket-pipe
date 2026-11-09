import {
  DeleteMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
  type SQSClientConfig,
} from '@aws-sdk/client-sqs';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import pg from 'pg';
import { createClient } from 'redis';

import { type Config, pickConfig, type RawEnv } from '../src/lib/config.js';

const { Client } = pg;

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
  print: (line: string) => void = console.log
): Promise<number> {
  let allOk = true;
  for (const [name, key] of CHECKS) {
    let ok: boolean;
    try {
      ok = await checks[key]();
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

function hasEndpoint(endpoint: string | undefined): endpoint is string {
  return typeof endpoint === 'string' && endpoint.trim() !== '';
}

function sqsClientConfig(config: SmokeConfig): SQSClientConfig {
  return {
    ...(hasEndpoint(config.SQS_ENDPOINT) ? { endpoint: config.SQS_ENDPOINT } : {}),
    region: config.AWS_REGION,
    credentials: {
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    },
  };
}

async function awsIdentity(config: SmokeConfig): Promise<boolean> {
  const sts = new STSClient({
    region: config.AWS_REGION,
    credentials: {
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    },
  });
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  // An account root (or root-derived) identity is the one credential that must never run the app.
  return (
    typeof identity.Arn === 'string' && identity.Arn.length > 0 && !identity.Arn.endsWith(':root')
  );
}

export function smokeMessageBody(id: string): string {
  return JSON.stringify({ ticketId: id, referenceNumber: `SMOKE-${id.slice(0, 8)}` });
}

async function sqsRoundTrip(config: SmokeConfig): Promise<boolean> {
  const client = new SQSClient(sqsClientConfig(config));
  const { QueueUrl } = await client.send(
    new GetQueueUrlCommand({ QueueName: config.SQS_QUEUE_NAME })
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

async function postgres(config: SmokeConfig): Promise<boolean> {
  const client = new Client(postgresConnectionConfig(config.DATABASE_URL));
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function redisCheck(config: Pick<SmokeConfig, 'REDIS_URL'>): Promise<boolean> {
  const client = createClient({
    url: config.REDIS_URL,
    // Without this, node-redis retries forever on an unreachable host and the check hangs.
    socket: { reconnectStrategy: false },
  });
  // node-redis emits 'error' before connect() rejects; with no listener Node throws the raw
  // error text (including the URL) to stderr and crashes outside runSmoke's catch.
  client.on('error', () => undefined);
  try {
    await client.connect();
    return (await client.ping()) === 'PONG';
  } finally {
    if (client.isOpen) await client.quit().catch(() => undefined);
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
    postgres: () => postgres(config),
    redis: () => redisCheck(config),
    redisTls: () => redisTls(config),
  };
}

if (import.meta.main) {
  process.exit(await runSmoke(defaultChecks()));
}
