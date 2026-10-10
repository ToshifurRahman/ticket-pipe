import { useQueries } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import type { RecentTicket } from '@/lib/recent-tickets';
import { relativeTime } from '@/lib/relative-time';
import { getTicketByRef } from '@/lib/tickets-api';
import { StatusPill } from './status-pill';

type RecentTicketsProps = {
  tickets: RecentTicket[];
  onForget: (ref: string) => void;
};

export function RecentTickets({ tickets, onForget }: RecentTicketsProps) {
  const statuses = useQueries({
    queries: tickets.map((t) => ({
      queryKey: ['ticket-by-ref', t.ref],
      queryFn: () => getTicketByRef(t.ref),
      staleTime: 30_000,
    })),
  });

  // A ref the API no longer knows (dev DB reset, deleted ticket) is dropped from the list.
  const gone = statuses
    .map((q, i) => (q.error instanceof ApiError && q.error.status === 404 ? tickets[i]?.ref : null))
    .filter((ref): ref is string => !!ref);
  const goneKey = gone.join(',');
  useEffect(() => {
    if (goneKey) goneKey.split(',').forEach(onForget);
  }, [goneKey, onForget]);

  if (tickets.length === 0) return null;

  return (
    <section aria-labelledby="recent-tickets-heading" className="rounded-xl border border-border bg-card/60 p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="recent-tickets-heading" className="text-sm font-semibold">
          Your recent tickets
        </h2>
        <span className="text-xs text-muted-foreground">Remembered on this browser only</span>
      </div>
      <ul className="flex flex-col gap-1">
        {tickets.map((t, i) => {
          const status = statuses[i]?.data?.status;
          return (
            <li key={t.ref}>
              <Link
                to={`/t/${t.ref}`}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 no-underline transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">{t.subject}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {t.ref} · {relativeTime(t.createdAt)}
                  </span>
                </span>
                {status && <StatusPill status={status} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
