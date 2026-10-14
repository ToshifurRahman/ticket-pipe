import { STATUS_LABELS } from '@/lib/ops-ticket';
import type { TicketStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const TONES: Record<TicketStatus, string> = {
  queued: 'text-muted-foreground [&>span]:bg-muted-foreground',
  processing: 'text-primary [&>span]:bg-primary [&>span]:animate-pulse',
  completed: 'text-success [&>span]:bg-success',
  failed: 'text-destructive [&>span]:bg-destructive',
  needs_attention: 'text-warning [&>span]:bg-warning',
};

// Ops sees the real status; the customer-facing pill folds failures into "With our team".
export function OpsStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[status]
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full" />
      {STATUS_LABELS[status]}
    </span>
  );
}
