/**
 * Boots a real API entry point (main.ts, index.ts or worker.ts) under Bun against a throwaway
 * Postgres schema and a dedicated SQS queue, so it cannot touch the dev data or the queue other
 * integration tests poll. Requires `bun` on PATH and the docker-compose stack.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';

import pg from 'pg';

import { createTestQueue, deleteTestQueue, uniqueQueueName } from './sqs-queue.js';

const API = path.resolve(import.meta.dirname, '../..');

export interface EntryProcess {
  proc: ChildProcess;
  base: string;
  queueName: string;
  databaseUrl: string;
  output: () => string;
  exited: Promise<number | null>;
  /** Sends SIGTERM and resolves with the exit code, or kills the process after `ms`. */
  terminate: (ms?: number) => Promise<number | null>;
  stop: () => Promise<void>;
}

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

async function withClient<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function createSchema(): Promise<{ schema: string; databaseUrl: string }> {
  const schema = `entry_test_${crypto.randomUUID().slice(0, 8)}`;
  await withClient((client) => client.query(`CREATE SCHEMA "${schema}"`));

  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const databaseUrl = url.toString();

  const migrated = spawnSync('bun', ['scripts/migrate.ts'], {
    cwd: API,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
  });
  if (migrated.status !== 0)
    throw new Error(`migrations failed:\n${migrated.stdout}\n${migrated.stderr}`);
  return { schema, databaseUrl };
}

export async function startEntry(
  script: string,
  env: Record<string, string> = {}
): Promise<EntryProcess> {
  const port = await freePort();
  const queueName = uniqueQueueName('ticket-pipe-entry');
  const queueUrl = await createTestQueue(queueName);
  const { schema, databaseUrl } = await createSchema();

  const proc = spawn('bun', [script], {
    cwd: API,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PORT: String(port),
      LLM_MODE: 'fake',
      LLM_FAKE_DELAY_MS: '0',
      SQS_QUEUE_NAME: queueName,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  const collect = (chunk: Buffer): void => {
    output = (output + chunk.toString()).slice(-8000);
  };
  proc.stdout.on('data', collect);
  proc.stderr.on('data', collect);

  const exited = new Promise<number | null>((resolve) =>
    proc.once('exit', (code) => resolve(code))
  );

  const terminate = async (ms = 30_000): Promise<number | null> => {
    if (proc.exitCode !== null) return proc.exitCode;
    proc.kill('SIGTERM');
    const killer = setTimeout(() => proc.kill('SIGKILL'), ms);
    try {
      return await exited;
    } finally {
      clearTimeout(killer);
    }
  };

  const stop = async (): Promise<void> => {
    if (proc.exitCode === null) {
      proc.kill('SIGKILL');
      await exited;
    }
    await deleteTestQueue(queueUrl).catch(() => undefined);
    await withClient((client) => client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)).catch(
      () => undefined
    );
  };

  return {
    proc,
    base: `http://localhost:${port}`,
    queueName,
    databaseUrl,
    output: () => output,
    exited,
    terminate,
    stop,
  };
}

async function poll<T>(
  entry: EntryProcess,
  what: string,
  probe: () => Promise<T | undefined>
): Promise<T> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (entry.proc.exitCode !== null)
      throw new Error(`process exited (${entry.proc.exitCode}) before ${what}:\n${entry.output()}`);
    try {
      const value = await probe();
      if (value !== undefined) return value;
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`timed out waiting for ${what}:\n${entry.output()}`);
}

export async function waitForHealth(entry: EntryProcess): Promise<void> {
  await poll(entry, 'health', async () =>
    (await fetch(`${entry.base}/health`)).ok ? true : undefined
  );
}

export async function waitForLog(entry: EntryProcess, text: string): Promise<void> {
  await poll(entry, `log "${text}"`, () =>
    Promise.resolve(entry.output().includes(text) ? true : undefined)
  );
}

export async function createTicket(entry: EntryProcess): Promise<string> {
  const res = await fetch(`${entry.base}/api/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      subject: 'Entry point check',
      description: 'This ticket checks which process picks the work up and how it stops.',
    }),
  });
  if (res.status !== 201) throw new Error(`ticket not created (${res.status})`);
  return ((await res.json()) as { ticketId: string }).ticketId;
}

export async function ticketStatus(entry: EntryProcess, id: string): Promise<string | undefined> {
  const res = await fetch(`${entry.base}/api/tickets/${id}`);
  return res.ok ? ((await res.json()) as { status: string }).status : undefined;
}

export function waitForStatus(entry: EntryProcess, id: string, status: string): Promise<void> {
  return poll(entry, `ticket ${id} to be ${status}`, async () =>
    (await ticketStatus(entry, id)) === status ? (true as const) : undefined
  ).then(() => undefined);
}
