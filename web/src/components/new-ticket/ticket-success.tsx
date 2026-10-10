import { ArrowRight, Check, CircleCheck, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

type TicketSuccessProps = {
  referenceNumber: string;
  onSubmitAnother: () => void;
};

export function TicketSuccess({ referenceNumber, onSubmitAnother }: TicketSuccessProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

  // The form this replaces held focus; hand it to the heading so screen readers announce
  // the result and keyboard users continue from here.
  useEffect(() => heading.current?.focus(), []);

  useEffect(() => {
    if (copy === 'idle') return;
    const timer = setTimeout(() => setCopy('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copy]);

  async function copyRef() {
    try {
      await navigator.clipboard.writeText(referenceNumber);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-border bg-card/60 p-6 sm:p-8">
      <div className="flex flex-col gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-success">
          <CircleCheck className="size-4" aria-hidden />
          Ticket received
        </span>
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          We're on it
        </h2>
        <p className="text-muted-foreground">
          Keep your reference to come back to this ticket. A reply usually arrives within a minute.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Your reference</span>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-input/30 py-1 pr-1 pl-3">
          <span className="min-w-0 flex-1 truncate font-mono text-sm" data-testid="ticket-reference">
            {referenceNumber}
          </span>
          <Button variant="ghost" size="icon" onClick={copyRef} aria-label="Copy reference">
            {copy === 'copied' ? <Check /> : <Copy />}
          </Button>
        </div>
        <span aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
          {copy === 'copied' && 'Copied to clipboard'}
          {copy === 'failed' && "Couldn't copy. Select the reference and copy it by hand."}
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link to={`/t/${referenceNumber}`} className="no-underline">
            Watch it live <ArrowRight />
          </Link>
        </Button>
        <Button variant="outline" onClick={onSubmitAnother}>
          Submit another ticket
        </Button>
      </div>
    </div>
  );
}
