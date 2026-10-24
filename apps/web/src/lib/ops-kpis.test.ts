import { describe, expect, it } from 'vitest';
import { computeKpis, formatPercent, formatSeconds } from './ops-kpis';
import type { AiSummaryRow, OpsSummary } from './types';

const row = (r: Partial<AiSummaryRow>): AiSummaryRow => ({
  operation: 'triage',
  provider: 'primary',
  count: 0,
  successCount: 0,
  avgDurationMs: 0,
  ...r,
});
const summary = (rows: AiSummaryRow[], tickets = 5): OpsSummary => ({
  since: '',
  until: '',
  ticketsInWindow: tickets,
  summary: rows,
});

describe('computeKpis', () => {
  it('weights rates and latency by call count', () => {
    const kpis = computeKpis(
      summary([
        row({ provider: 'primary', operation: 'triage', count: 90, successCount: 90, avgDurationMs: 1000 }),
        row({ provider: 'primary', operation: 'draft', count: 6, successCount: 4, avgDurationMs: 4000 }),
        row({ provider: 'backup', operation: 'draft', count: 4, successCount: 2, avgDurationMs: 6000 }),
      ])
    );
    expect(kpis.tickets).toBe(5);
    expect(kpis.successRate).toBeCloseTo(0.96);
    expect(kpis.fallbackRate).toBeCloseTo(0.04);
    // (90*1000 + 6*4000 + 4*6000) / 100
    expect(kpis.avgLatencyMs).toBeCloseTo(1380);
  });

  it('has no rates before the first call, but still counts tickets', () => {
    expect(computeKpis(summary([], 3))).toEqual({
      tickets: 3,
      successRate: null,
      avgLatencyMs: null,
      fallbackRate: null,
    });
  });
});

describe('formatting', () => {
  it('shows a dash for no data', () => {
    expect(formatPercent(null)).toBe('n/a');
    expect(formatSeconds(null)).toBe('n/a');
    expect(formatPercent(0.965)).toBe('96.5%');
    expect(formatSeconds(4800)).toBe('4.8 s');
  });
});
