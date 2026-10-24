import { Button } from '@/components/ui/button';
import type { OpsTab } from '@/lib/ops-params';
import type { OpsTicketList } from '@/lib/types';

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
          <Button
            key={value}
            variant="tb"
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(value)}
            className="items-baseline"
          >
            {label}
            {counts && (
              <span className="font-mono text-xs font-normal tracking-normal text-muted-foreground">
                {countFor(value, counts)}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
