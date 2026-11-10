import { describe, expect, it } from 'vitest';

import { smokeQueueName } from '../../../scripts/queue-names.js';
import { parseEnv } from '../../../src/lib/config.js';

const BASE = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  SQS_QUEUE_NAME: 'tickets',
  SQS_ENDPOINT: 'http://localhost:4566',
  LLM_MODE: 'fake',
};

function issues(env: Record<string, string>): string[] {
  const result = parseEnv({ ...BASE, ...env });
  return result.success ? [] : result.issues.map((issue) => `${issue.variable}: ${issue.message}`);
}

describe('smoke queue name', () => {
  it('derives a dedicated queue so the running worker never consumes the probe', () => {
    expect(smokeQueueName('ticket-processing')).toBe('ticket-processing-smoke');
  });

  it('keeps the longest accepted main queue name within the SQS limit', () => {
    const longest = 'a'.repeat(74);
    expect(issues({ SQS_QUEUE_NAME: longest })).toEqual([]);
    expect(smokeQueueName(longest)).toHaveLength(80);
  });
});

describe('queue name validation', () => {
  it('rejects a 75-character main queue name without printing the value', () => {
    const name = 'a'.repeat(75);
    const messages = issues({ SQS_QUEUE_NAME: name });

    expect(messages.some((message) => message.startsWith('SQS_QUEUE_NAME:'))).toBe(true);
    expect(messages.join('\n')).toContain('74');
    expect(messages.join('\n')).not.toContain(name);
  });

  it('rejects an illegal character without printing the value', () => {
    const name = 'tickets!bad';
    const messages = issues({ SQS_QUEUE_NAME: name });

    expect(messages.some((message) => message.startsWith('SQS_QUEUE_NAME:'))).toBe(true);
    expect(messages.join('\n')).not.toContain(name);
  });

  it('rejects an explicit DLQ name longer than 80 characters', () => {
    const messages = issues({ SQS_DLQ_NAME: 'd'.repeat(81) });

    expect(messages.some((message) => message.startsWith('SQS_DLQ_NAME:'))).toBe(true);
    expect(messages.join('\n')).toContain('80');
  });
});
