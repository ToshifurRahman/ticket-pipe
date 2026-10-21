import { Link } from 'react-router-dom';
import { FormHeader } from '@/components/form/form-header';
import { FormBody, FormPanel } from '@/components/form/form-panel';
import { TrackForm } from '@/components/track-ticket-field';
import { Button } from '@/components/ui/button';
import { PlyRow } from '@/components/ticket/ply-row';
import { REF_EXAMPLE } from '@/lib/ticket-ref';
import type { Ply } from '@/lib/ticket-thread';

// The ticket page's other states, printed on the same form: loading, unknown, load failed.

const WAITING: Ply[] = [
  { n: 1, key: 'received', label: 'Received', state: 'waiting', time: null },
  { n: 2, key: 'triage', label: 'Triage', state: 'waiting', time: null },
  { n: 3, key: 'draft', label: 'Draft', state: 'waiting', time: null },
  { n: 4, key: 'reply', label: 'Reply', state: 'waiting', time: null },
];

export function TicketSkeleton({ reference = '-' }: { reference?: string }) {
  return (
    <FormPanel as="article" aria-busy="true" aria-label="Loading ticket">
      <FormHeader kicker="Service ticket · Customer copy" title="Loading..." referenceNumber={reference} />
      <PlyRow plies={WAITING} />
      <div aria-hidden className="flex min-h-62.5 flex-col px-5.5 py-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-11 border-b border-rule" />
        ))}
      </div>
    </FormPanel>
  );
}

export function TicketNotFound({ reference }: { reference?: string }) {
  return (
    <FormPanel as="article" enter className="max-w-160">
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
    <FormPanel as="article" enter role="alert" className="max-w-160">
      <FormHeader kicker="Could not load" title="We couldn't load this ticket right now" referenceNumber={reference} />
      <FormBody>
        <p className="text-muted-foreground">Your ticket is safe. Check your connection and try again.</p>
        <div>
          <Button size="sm" onClick={onRetry} disabled={retrying}>
            {retrying ? 'Trying...' : 'Try again'}
          </Button>
        </div>
      </FormBody>
    </FormPanel>
  );
}
