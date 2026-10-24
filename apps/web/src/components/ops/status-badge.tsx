import { STATUS_LABELS } from '@/lib/ops-ticket';
import type { TicketStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const TONES: Record<TicketStatus, string> = {
  queued: 'text-muted-foreground',
  processing: 'text-ply-live-ink',
  completed: 'text-ply-triaged',
  failed: 'text-destructive',
  needs_attention: 'text-priority-high',
};

// Ops sees the real status; the customer-facing pill folds failures into "With our team".
export function OpsStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={cn(
        'label-caps inline-flex shrink-0 items-center gap-1.75 border border-current px-2.25 py-px text-caption whitespace-nowrap',
        TONES[status]
      )}
    >
      <span aria-hidden className="size-1.75 bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}
