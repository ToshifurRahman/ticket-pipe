import { useQuery } from '@tanstack/react-query';
import { computeKpis, formatPercent, formatSeconds } from '@/lib/ops-kpis';
import { getOpsSummary, opsKeys } from '@/lib/ops-api';

function Tile({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card/70 px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={loading ? 'mt-1 h-7 w-16 animate-pulse rounded bg-muted' : 'mt-1 text-2xl font-semibold tabular-nums'}>
        {loading ? '' : value}
      </dd>
    </div>
  );
}

// The last 24 hours, from the AI-call summary. A failed fetch shows dashes, not an error:
// the table below is the part that has to work.
export function KpiStrip() {
  const { data, isPending } = useQuery({ queryKey: opsKeys.summary, queryFn: getOpsSummary });
  const kpis = data ? computeKpis(data) : null;

  return (
    <dl aria-label="Last 24 hours" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Tickets · 24h" value={kpis ? String(kpis.tickets) : 'n/a'} loading={isPending} />
      <Tile label="AI success rate" value={formatPercent(kpis?.successRate ?? null)} loading={isPending} />
      <Tile label="Avg latency" value={formatSeconds(kpis?.avgLatencyMs ?? null)} loading={isPending} />
      <Tile label="Fallback rate" value={formatPercent(kpis?.fallbackRate ?? null)} loading={isPending} />
    </dl>
  );
}
