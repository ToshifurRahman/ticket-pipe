import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FormHeader } from '@/components/form/form-header';
import { FormBody, FormPanel } from '@/components/form/form-panel';
import { Button } from '@/components/ui/button';
import { useCopy } from '@/hooks/use-copy';
import { printedTime } from '@/lib/relative-time';

type TicketSuccessProps = {
  referenceNumber: string;
  createdAt: string;
  onSubmitAnother: () => void;
};

export function TicketSuccess({ referenceNumber, createdAt, onSubmitAnother }: TicketSuccessProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [copy, copyText] = useCopy();

  // The form this replaces held focus; hand it to the heading so screen readers announce
  // the result and keyboard users continue from here.
  useEffect(() => heading.current?.focus(), []);

  return (
    <FormPanel enter aria-label="Ticket received">
      <FormHeader as="h2" titleRef={heading} kicker="Service ticket · Filed" title="We're on it" referenceNumber={referenceNumber} />
      <FormBody>
        <div className="flex flex-wrap items-center gap-4">
          <span className="button-caps stamp-tilt inline-block border-2 border-current px-3 py-1 text-[0.8125rem] text-ply-triaged">
            Ticket received
          </span>
          <span className="font-mono text-[0.8125rem] text-muted-foreground">{printedTime(createdAt)}</span>
        </div>
        <p className="text-base text-muted-foreground">
          Keep your reference to come back to this ticket. A reply usually arrives within a minute.
        </p>

        <div className="grid gap-2">
          <span className="button-caps text-xs text-muted-foreground">Your reference</span>
          <div className="flex items-center justify-between gap-3 border border-border px-3 py-2.5">
            <span className="font-mono text-sm break-all" data-testid="ticket-reference">
              {referenceNumber}
            </span>
            <Button variant="tb" aria-label="Copy reference" onClick={() => copyText(referenceNumber)}>
              {copy === 'copied' ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <span aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
            {copy === 'copied' && 'Copied to clipboard'}
            {copy === 'failed' && "Couldn't copy. Select the reference and copy it by hand."}
          </span>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild variant="solid">
            <Link to={`/t/${referenceNumber}`} className="no-underline">
              Watch it live
            </Link>
          </Button>
          <Button variant="tb" className="min-h-12 px-5" onClick={onSubmitAnother}>
            Submit another ticket
          </Button>
        </div>
      </FormBody>
    </FormPanel>
  );
}
