import { useQuery } from '@tanstack/react-query';
import { computeKpis, formatPercent, formatSeconds } from '@/lib/ops-kpis';
import { getOpsSummary, opsKeys } from '@/lib/ops-api';

// "96.1%" prints as 96.1 with a small muted %, "2.4 s" as 2.4 with a small s.
function splitUnit(text: string): [string, string] {
  const match = /^(-?[\d.]+)\s*(.*)$/.exec(text);
  return match ? [match[1], match[2]] : [text, ''];
}

function Tile({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  const [number, unit] = splitUnit(value);
  return (
    <div className="bg-background px-4.5 py-3.5">
      <dt className="button-caps text-[0.6875rem] text-muted-foreground">{label}</dt>
      <dd
        className={
          loading
            ? 'mt-1.5 h-8 w-16 animate-pulse bg-muted'
            : 'mt-1.5 font-mono text-[2rem] leading-none font-bold'
        }
      >
        {loading ? '' : number}
        {!loading && unit && (
          <small className="text-[0.8125rem] font-normal text-muted-foreground">{unit}</small>
        )}
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
    <dl
      aria-label="Last 24 hours"
      className="grid grid-cols-2 gap-px border border-border bg-border md:grid-cols-4"
    >
      <Tile label="Tickets · 24h" value={kpis ? String(kpis.tickets) : 'n/a'} loading={isPending} />
      <Tile
        label="AI success rate"
        value={formatPercent(kpis?.successRate ?? null)}
        loading={isPending}
      />
      <Tile
        label="Avg latency"
        value={formatSeconds(kpis?.avgLatencyMs ?? null)}
        loading={isPending}
      />
      <Tile
        label="Fallback rate"
        value={formatPercent(kpis?.fallbackRate ?? null)}
        loading={isPending}
      />
    </dl>
  );
}
