import type { TicketStatus } from '@/lib/types';
import { Stamp } from '@/components/form/stamp';
import { cn } from '@/lib/utils';

// Customers see three states. Failures and tickets awaiting review share one neutral label:
// the public view never says a ticket failed.
const PILLS: Record<TicketStatus, { label: string; tone: string }> = {
  queued: { label: 'Processing', tone: 'text-primary' },
  processing: { label: 'Processing', tone: 'text-primary' },
  completed: { label: 'Replied', tone: 'text-success' },
  failed: { label: 'With our team', tone: 'text-muted-foreground' },
  needs_attention: { label: 'With our team', tone: 'text-muted-foreground' },
};

export function statusLabel(status: TicketStatus): string {
  return PILLS[status].label;
}

// A small stamp: outline in the status colour, set at the shared tilt.
export function StatusPill({ status }: { status: TicketStatus }) {
  const { label, tone } = PILLS[status];
  return (
    <Stamp caps="label" className={cn('shrink-0 border border-current px-2 py-0.5 text-caption', tone)}>
      {label}
    </Stamp>
  );
}
