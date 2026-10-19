import { Link } from 'react-router-dom';
import { FormHeader } from '@/components/form/form-header';
import { FormBody, FormPanel } from '@/components/form/form-panel';
import { TrackForm } from '@/components/track-ticket-field';
import { Button } from '@/components/ui/button';
import { REF_EXAMPLE } from '@/lib/ticket-ref';

// The ticket page's other states, printed on the same form: loading, unknown, load failed.

const PLY_NAMES = ['Received', 'Triage', 'Draft', 'Reply'];

export function TicketSkeleton({ reference = '-' }: { reference?: string }) {
  return (
    <FormPanel as="article" aria-busy="true" aria-label="Loading ticket">
      <FormHeader kicker="Service ticket · Customer copy" title="Loading…" referenceNumber={reference} />
      <ol aria-hidden className="grid grid-cols-4 border-b border-rule">
        {PLY_NAMES.map((name, i) => (
          <li key={name} className="flex flex-col gap-1 border-l border-rule px-2 py-3 first:border-l-0 sm:px-4 sm:py-4">
            <span className="font-mono text-xs">{i + 1}</span>
            <span className="label-caps text-xs text-muted-foreground sm:text-sm">{name}</span>
          </li>
        ))}
      </ol>
      <div aria-hidden className="flex flex-col p-4 sm:p-5.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-11 border-b border-rule" />
        ))}
      </div>
    </FormPanel>
  );
}

export function TicketNotFound({ reference }: { reference?: string }) {
  return (
    <FormPanel as="article" enter className="max-w-2xl">
      <FormHeader kicker="Not on file" title="We couldn't find that ticket" referenceNumber={reference || '-'} />
      <FormBody>
        <p className="text-muted-foreground">
          Check the reference and try again. It looks like <span className="font-mono text-sm text-foreground">{REF_EXAMPLE}</span>.
        </p>
        <TrackForm />
        <p className="text-sm text-muted-foreground">
          Don't have one? <Link to="/new">Open a new ticket</Link>.
        </p>
      </FormBody>
    </FormPanel>
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
    <FormPanel as="article" enter role="alert" className="max-w-2xl">
      <FormHeader kicker="Could not load" title="We couldn't load this ticket right now" referenceNumber={reference} />
      <FormBody>
        <p className="text-muted-foreground">Your ticket is safe. Check your connection and try again.</p>
        <div>
          <Button size="sm" onClick={onRetry} disabled={retrying}>
            {retrying ? 'Trying…' : 'Try again'}
          </Button>
        </div>
      </FormBody>
    </FormPanel>
  );
}
