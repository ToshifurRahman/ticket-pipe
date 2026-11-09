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

import { type Config, type RawEnv, scriptConfig } from '../src/lib/config.js';

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

async function sqsRoundTrip(config: SmokeConfig): Promise<boolean> {
  const client = new SQSClient(sqsClientConfig(config));
  const { QueueUrl } = await client.send(
    new GetQueueUrlCommand({ QueueName: config.SQS_QUEUE_NAME })
  );
  if (!QueueUrl) return false;

  const id = `smoke-${crypto.randomUUID()}`;
  await client.send(new SendMessageCommand({ QueueUrl, MessageBody: id }));

  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await client.send(
      new ReceiveMessageCommand({
        QueueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 2,
      })
    );
    for (const message of result.Messages ?? []) {
      if (message.Body !== id) continue;
      if (!message.ReceiptHandle) return false;
      await client.send(
        new DeleteMessageCommand({ QueueUrl, ReceiptHandle: message.ReceiptHandle })
      );
      return true;
    }
  }
  return false;
}

function postgresSslConfig(connectionString: string): pg.ClientConfig['ssl'] | undefined {
  const url = new URL(connectionString);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('not a postgres URL');
  }
  const sslmode = url.searchParams.get('sslmode');
  if (sslmode === 'disable') throw new Error('TLS is disabled');
  // No sslmode in the URL still means TLS: this check must never pass over a plaintext link.
  return sslmode ? undefined : { rejectUnauthorized: true };
}

async function postgres(config: SmokeConfig): Promise<boolean> {
  const ssl = postgresSslConfig(config.DATABASE_URL);
  const client = new Client({ connectionString: config.DATABASE_URL, ssl });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function redis(config: SmokeConfig): Promise<boolean> {
  const client = createClient({ url: config.REDIS_URL });
  try {
    await client.connect();
    return (await client.ping()) === 'PONG';
  } finally {
    await client.quit().catch(() => undefined);
  }
}

function redisTls(config: SmokeConfig): boolean {
  return new URL(config.REDIS_URL).protocol === 'rediss:';
}

export function defaultChecks(env?: RawEnv): SmokeChecks {
  const config = scriptConfig(KEYS, {}, env);
  return {
    awsIdentity: () => awsIdentity(config),
    awsNotLocal: () => !hasEndpoint(config.SQS_ENDPOINT),
    sqsRoundTrip: () => sqsRoundTrip(config),
    postgres: () => postgres(config),
    redis: () => redis(config),
    redisTls: () => redisTls(config),
  };
}

if (import.meta.main) {
  process.exit(await runSmoke(defaultChecks()));
}
