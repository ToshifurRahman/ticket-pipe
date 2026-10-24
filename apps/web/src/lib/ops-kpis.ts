import type { OpsSummary } from './types';

export type OpsKpis = {
  tickets: number;
  /** 0 to 1, or null before the first AI call. */
  successRate: number | null;
  avgLatencyMs: number | null;
  fallbackRate: number | null;
};

/** The KPI strip from the AI summary. Rates are weighted by call count, not averaged per row. */
export function computeKpis(summary: OpsSummary): OpsKpis {
  const rows = summary.summary;
  const calls = rows.reduce((n, r) => n + r.count, 0);
  if (calls === 0) return { tickets: summary.ticketsInWindow, successRate: null, avgLatencyMs: null, fallbackRate: null };
  return {
    tickets: summary.ticketsInWindow,
    successRate: rows.reduce((n, r) => n + r.successCount, 0) / calls,
    avgLatencyMs: rows.reduce((n, r) => n + r.avgDurationMs * r.count, 0) / calls,
    fallbackRate: rows.filter((r) => r.provider === 'backup').reduce((n, r) => n + r.count, 0) / calls,
  };
}

export const formatPercent = (rate: number | null) => (rate === null ? 'n/a' : `${(rate * 100).toFixed(1)}%`);
export const formatSeconds = (ms: number | null) => (ms === null ? 'n/a' : `${(ms / 1000).toFixed(1)} s`);
