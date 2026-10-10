import { RotateCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TrackForm } from '@/components/track-ticket-field';
import { Button } from '@/components/ui/button';
import { REF_EXAMPLE } from '@/lib/ticket-ref';

// The ticket page's non-thread states: loading, unknown ticket, and a load that failed.

export function TicketSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading ticket" className="flex animate-pulse flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="h-8 w-2/3 rounded-lg bg-muted" />
        <div className="h-4 w-56 rounded bg-muted" />
      </div>
      <div className="h-24 rounded-xl bg-muted/60" />
      <div className="ml-auto h-20 w-3/4 rounded-2xl bg-muted" />
      <div className="flex items-start gap-3">
        <div className="size-8 rounded-lg bg-muted" />
        <div className="h-10 w-48 rounded-full bg-muted" />
      </div>
    </div>
  );
}

export function TicketNotFound() {
  return (
    <section className="mx-auto flex max-w-lg flex-col gap-5 rounded-xl border border-border bg-card/60 p-6 sm:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">We couldn't find that ticket</h1>
        <p className="text-muted-foreground">
          Check the reference and try again. It looks like <span className="font-mono text-sm">{REF_EXAMPLE}</span>.
        </p>
      </div>
      <TrackForm />
      <p className="text-sm text-muted-foreground">
        Don't have one? <Link to="/new">Open a new ticket</Link>.
      </p>
    </section>
  );
}

export function TicketLoadError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <section
      role="alert"
      className="mx-auto flex max-w-lg flex-col items-start gap-4 rounded-xl border border-border bg-card/60 p-6 sm:p-8"
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">We couldn't load this ticket right now</h1>
        <p className="text-muted-foreground">Your ticket is safe. Check your connection and try again.</p>
      </div>
      <Button onClick={onRetry} disabled={retrying}>
        <RotateCw className={retrying ? 'animate-spin' : undefined} /> Try again
      </Button>
    </section>
  );
}
