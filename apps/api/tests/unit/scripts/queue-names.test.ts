import { describe, expect, it } from 'vitest';

import { smokeQueueName } from '../../../scripts/queue-names.js';

describe('smoke queue name', () => {
  it('derives a dedicated queue so the running worker never consumes the probe', () => {
    expect(smokeQueueName('ticket-processing')).toBe('ticket-processing-smoke');
  });
});
