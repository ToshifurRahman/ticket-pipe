/**
 * The worker's abort path against real SQS: run() must stop an open long-poll and resolve
 * without waiting for the 20s receive timeout. A dedicated queue keeps this child away from
 * the shared test queue.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestQueue, deleteTestQueue, uniqueQueueName } from '../../helpers/sqs-queue.js';

const API = path.resolve(import.meta.dirname, '../../..');
const WORKER = pathToFileURL(path.join(API, 'src/worker.ts')).href;

let queueName: string;
let queueUrl: string;

beforeAll(async () => {
  queueName = uniqueQueueName('ticket-pipe-abort');
  queueUrl = await createTestQueue(queueName);
});

afterAll(async () => {
  if (queueUrl) await deleteTestQueue(queueUrl).catch(() => undefined);
});

describe('worker shutdown', () => {
  it('resolves promptly when aborted during an SQS long poll', () => {
    const script = `
import { run } from ${JSON.stringify(WORKER)};
const controller = new AbortController();
const started = Date.now();
setTimeout(() => controller.abort(), 250);
await run({ signal: controller.signal, receiveWaitTimeSeconds: 20 });
console.log(JSON.stringify({ elapsedMs: Date.now() - started }));
process.exit(0);
`;
    const result = spawnSync('bun', ['-e', script], {
      cwd: API,
      env: { ...process.env, LLM_MODE: 'fake', SQS_QUEUE_NAME: queueName },
      encoding: 'utf8',
      timeout: 5000,
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const measured = result.stdout.split('\n').find((line) => line.includes('"elapsedMs"'));
    expect(measured).toBeTruthy();
    expect((JSON.parse(measured!) as { elapsedMs: number }).elapsedMs).toBeLessThan(2000);
  }, 15_000);
});
