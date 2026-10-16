import type { OpsTab } from '@/lib/ops-params';
import type { OpsTicketList } from '@/lib/types';
import { cn } from '@/lib/utils';

const TABS: { tab: OpsTab; label: string }[] = [
  { tab: 'all', label: 'All' },
  { tab: 'needs_attention', label: 'Needs attention' },
  { tab: 'failed', label: 'Failed' },
  { tab: 'completed', label: 'Completed' },
];

function countFor(tab: OpsTab, counts: OpsTicketList['counts']): number {
  if (tab === 'all') return Object.values(counts).reduce((n, c) => n + (c ?? 0), 0);
  return counts[tab] ?? 0;
}

type StatusTabsProps = {
  tab: OpsTab;
  counts: OpsTicketList['counts'] | undefined;
  onChange: (tab: OpsTab) => void;
};

export function StatusTabs({ tab, counts, onChange }: StatusTabsProps) {
  return (
    <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-2">
      {TABS.map(({ tab: value, label }) => {
        const selected = value === tab;
        return (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(value)}
            className={cn(
              'inline-flex items-center gap-2 border px-3 py-1.5 text-sm font-medium',
              selected ? 'border-foreground bg-secondary text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
            {counts && <span className="font-mono text-xs tabular-nums text-muted-foreground">{countFor(value, counts)}</span>}
          </button>
        );
      })}
    </div>
  );
}
