import type { TicketStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

// Customers see three states. Failures and tickets awaiting review share one neutral label:
// the public view never says a ticket failed.
const PILLS: Record<TicketStatus, { label: string; tone: string }> = {
  queued: { label: 'Processing', tone: 'text-primary [&>span]:bg-primary [&>span]:animate-pulse' },
  processing: { label: 'Processing', tone: 'text-primary [&>span]:bg-primary [&>span]:animate-pulse' },
  completed: { label: 'Replied', tone: 'text-success [&>span]:bg-success' },
  failed: { label: 'With our team', tone: 'text-muted-foreground [&>span]:bg-muted-foreground' },
  needs_attention: { label: 'With our team', tone: 'text-muted-foreground [&>span]:bg-muted-foreground' },
};

export function statusLabel(status: TicketStatus): string {
  return PILLS[status].label;
}

export function StatusPill({ status }: { status: TicketStatus }) {
  const { label, tone } = PILLS[status];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs font-medium',
        tone
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full" />
      {label}
    </span>
  );
}
