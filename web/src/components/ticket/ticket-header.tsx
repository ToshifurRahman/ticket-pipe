import { Check, Copy } from 'lucide-react';
import { StatusPill } from '@/components/new-ticket/status-pill';
import { Button } from '@/components/ui/button';
import { useCopy } from '@/hooks/use-copy';
import type { TicketStatus } from '@/lib/types';

type TicketHeaderProps = {
  subject: string;
  referenceNumber: string;
  status: TicketStatus;
};

export function TicketHeader({ subject, referenceNumber, status }: TicketHeaderProps) {
  const [copy, copyText] = useCopy();

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words sm:text-3xl">{subject}</h1>
        <StatusPill status={status} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground" data-testid="ticket-reference">
          {referenceNumber}
        </span>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => copyText(referenceNumber)}>
          {copy === 'copied' ? <Check /> : <Copy />}
          {copy === 'copied' ? 'Copied' : 'Copy'}
        </Button>
        <span aria-live="polite" className="sr-only">
          {copy === 'copied' && 'Reference copied to clipboard'}
          {copy === 'failed' && "Couldn't copy the reference"}
        </span>
      </div>
    </header>
  );
}
