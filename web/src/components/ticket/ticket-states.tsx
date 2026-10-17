import { Link } from 'react-router-dom';
import { TrackForm } from '@/components/track-ticket-field';
import { Button } from '@/components/ui/button';
import { REF_EXAMPLE } from '@/lib/ticket-ref';
import { TicketFormHeader } from './ticket-form-header';

// The ticket page's other states, printed on the same form: loading, unknown, load failed.

const PLY_NAMES = ['Received', 'Triage', 'Draft', 'Reply'];

export function TicketSkeleton({ reference = '-' }: { reference?: string }) {
  return (
    <article aria-busy="true" aria-label="Loading ticket" className="flex flex-col gap-8">
      <TicketFormHeader copyLine="Customer copy" title="Loading…" referenceNumber={reference} copyable={false} />
      <ol aria-hidden className="ruled grid grid-cols-4">
        {PLY_NAMES.map((name, i) => (
          <li key={name} className="flex flex-col gap-1 border-l border-rule px-2 py-3 first:border-l-0 sm:px-4 sm:py-4">
            <span className="font-mono text-xs">{i + 1}</span>
            <span className="label-caps text-xs text-muted-foreground sm:text-sm">{name}</span>
          </li>
        ))}
      </ol>
      <div aria-hidden className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border-b border-rule pb-4" />
        ))}
      </div>
    </article>
  );
}

export function TicketNotFound({ reference }: { reference?: string }) {
  return (
    <article className="flex flex-col gap-8">
      <TicketFormHeader
        copyLine="Not on file"
        title="We couldn't find that ticket"
        referenceNumber={reference || '-'}
        copyable={false}
      />
      <section className="ruled flex max-w-lg flex-col gap-5 p-5 sm:p-6">
        <p className="text-muted-foreground">
          Check the reference and try again. It looks like <span className="font-mono text-sm">{REF_EXAMPLE}</span>.
        </p>
        <TrackForm />
        <p className="text-sm text-muted-foreground">
          Don't have one? <Link to="/new">Open a new ticket</Link>.
        </p>
      </section>
    </article>
  );
}

export function TicketLoadError({
  reference,
  onRetry,
  retrying,
}: {
  reference: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <article role="alert" className="flex flex-col gap-8">
      <TicketFormHeader
        copyLine="Could not load"
        title="We couldn't load this ticket right now"
        referenceNumber={reference}
      />
      <section className="ruled flex max-w-lg flex-col items-start gap-4 p-5 sm:p-6">
        <p className="text-muted-foreground">Your ticket is safe. Check your connection and try again.</p>
        <Button onClick={onRetry} disabled={retrying}>
          {retrying ? 'Trying…' : 'Try again'}
        </Button>
      </section>
    </article>
  );
}
