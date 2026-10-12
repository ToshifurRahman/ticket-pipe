import { describe, expect, it } from 'vitest';
import { DEMO_FRAMES, DEMO_REFERENCE, FINAL_FRAME } from './demo-script';
import { isValidRef } from '@/lib/ticket-ref';

describe('demo script', () => {
  it('ends replied with every step done', () => {
    const last = DEMO_FRAMES[FINAL_FRAME];
    expect(last.support.kind).toBe('replied');
    expect(last.steps.every((s) => s.state === 'done')).toBe(true);
  });

  it('never goes backwards', () => {
    const doneCounts = DEMO_FRAMES.map((f) => f.steps.filter((s) => s.state === 'done').length);
    expect(doneCounts).toEqual([...doneCounts].sort((a, b) => a - b));
  });

  it('uses a reference in the real format', () => {
    expect(isValidRef(DEMO_REFERENCE)).toBe(true);
  });
});
