import { useQueries } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import type { RecentTicket } from '@/lib/recent-tickets';
import { relativeTime } from '@/lib/relative-time';
import { getTicketByRef, ticketQueryKey } from '@/lib/tickets-api';
import { StatusPill } from './status-pill';

type RecentTicketsProps = {
  tickets: RecentTicket[];
  onForget: (ref: string) => void;
};

export function RecentTickets({ tickets, onForget }: RecentTicketsProps) {
  const statuses = useQueries({
    queries: tickets.map((t) => ({
      queryKey: ticketQueryKey(t.ref),
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
    <section aria-labelledby="recent-tickets-heading" className="border border-border p-5">
      <h2 id="recent-tickets-heading" className="label-caps mb-3.5 text-sm">
        Your recent tickets
      </h2>
      <p className="-mt-1.5 mb-3 font-mono text-caption text-muted-foreground">Remembered on this browser only</p>
      <ul className="flex flex-col">
        {tickets.map((t, i) => {
          const status = statuses[i]?.data?.status;
          return (
            <li key={t.ref} className="border-t border-border">
              <Link
                to={`/t/${t.ref}`}
                className="group flex items-center justify-between gap-3 py-3 no-underline"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold text-foreground group-hover:underline">{t.subject}</span>
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
