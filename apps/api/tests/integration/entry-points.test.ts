/**
 * `start:api` and `start:worker` must each run alone (they are the two services of a later
 * split). Real Bun processes against a throwaway schema and queue; see
 * tests/helpers/entry-process.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  createTicket,
  type EntryProcess,
  startEntry,
  ticketStatus,
  waitForHealth,
  waitForLog,
  waitForStatus,
} from '../helpers/entry-process.js';

let api: EntryProcess | undefined;
let worker: EntryProcess | undefined;

afterEach(async () => {
  await Promise.all([api?.stop(), worker?.stop()]);
  api = undefined;
  worker = undefined;
});

describe('src/index.ts (API only)', () => {
  it('serves requests, leaves tickets queued, and exits cleanly on SIGTERM', async () => {
    api = await startEntry('src/index.ts');
    await waitForHealth(api);

    const id = await createTicket(api);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(await ticketStatus(api, id)).toBe('queued');

    expect(await api.terminate()).toBe(0);
    expect(api.output()).toContain('Shutdown complete');
  }, 60_000);
});

describe('src/worker.ts (worker only)', () => {
  it('processes a ticket the API queued, opens no port, and exits cleanly on SIGTERM', async () => {
    // The API half runs here only to take the submission; its own worker is not started.
    api = await startEntry('src/index.ts');
    await waitForHealth(api);
    const id = await createTicket(api);

    worker = await startEntry('src/worker.ts', {
      DATABASE_URL: api.databaseUrl,
      SQS_QUEUE_NAME: api.queueName,
    });
    await waitForLog(worker, 'Worker started');
    await waitForStatus(api, id, 'completed');

    await expect(fetch(`${worker.base}/health`)).rejects.toThrow();

    expect(await worker.terminate()).toBe(0);
    expect(worker.output()).toContain('Shutdown complete');
  }, 60_000);
});
