import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useEmailOffered } from '@/components/ticket/notify-card';
import { OfficeUse } from '@/components/ticket/office-use';
import { PlyRow } from '@/components/ticket/ply-row';
import { TicketFormHeader } from '@/components/ticket/ticket-form-header';
import { TicketLoadError, TicketNotFound, TicketSkeleton } from '@/components/ticket/ticket-states';
import { TicketThread } from '@/components/ticket/ticket-thread';
import { brand } from '@/config/brand';
import { useSocketInvalidation, type InvalidationMap } from '@/hooks/use-socket-invalidation';
import { ApiError } from '@/lib/api';
import type { getSocket } from '@/lib/socket';
import { notificationQueryKey } from '@/lib/notifications-api';
import { isValidRef, normalizeRef } from '@/lib/ticket-ref';
import { supportSide, ticketPlies } from '@/lib/ticket-thread';
import type { TicketDetail } from '@/lib/types';
import { getTicketByRef, ticketQueryKey } from '@/lib/tickets-api';

export function TicketPage() {
  const raw = useParams().ref ?? '';
  const ref = normalizeRef(raw);

  if (!isValidRef(ref)) return <TicketNotFound reference={raw.trim().toUpperCase().slice(0, 40)} />;
  // A lowercase or padded ref is the same ticket; keep one canonical URL.
  if (ref !== raw) return <Navigate to={`/t/${ref}`} replace />;
  return <LiveTicket key={ref} reference={ref} />;
}

function LiveTicket({ reference }: { reference: string }) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ticketQueryKey(reference), [reference]);
  const { data: ticket, error, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () => getTicketByRef(reference),
  });

  useEffect(() => {
    document.title = `Ticket ${reference} · ${brand.name}`;
  }, [reference]);

  // Every stage event, ticket.completed included, arrives as `ticket:update` and only
  // marks the lookup stale; the API's public view is what gets rendered.
  const ticketId = ticket?.id;
  const map = useMemo<InvalidationMap>(
    () => ({ 'ticket:update': ticketId ? [queryKey, notificationQueryKey(ticketId)] : [queryKey] }),
    [queryKey, ticketId]
  );
  const onConnect = useCallback(
    (socket: ReturnType<typeof getSocket>) => {
      if (!ticketId) return;
      socket.emit('join', ticketId);
      // Events between the first load and this join were missed: read the ticket again.
      void queryClient.invalidateQueries({ queryKey });
    },
    [ticketId, queryClient, queryKey]
  );
  // Only a completed ticket stops listening. failed / needs_attention stay connected so a
  // replay by the team (`ticket.requeued`) brings the thread back to life.
  useSocketInvalidation(map, { onConnect, enabled: !!ticketId && ticket?.status !== 'completed' });

  if (error instanceof ApiError && error.status === 404) return <TicketNotFound reference={reference} />;
  if (!ticket && error) return <TicketLoadError reference={reference} onRetry={() => void refetch()} retrying={isFetching} />;
  if (!ticket) return <TicketSkeleton reference={reference} />;

  return <TicketForm ticket={ticket} />;
}

function TicketForm({ ticket }: { ticket: TicketDetail }) {
  const emailOffered = useEmailOffered(ticket.id);
  const plies = ticketPlies(ticket);
  const support = supportSide(ticket);
  const badges = support.kind === 'working' || support.kind === 'replied' || support.kind === 'on-hold' ? support.badges : null;

  return (
    <article className="grid w-full gap-8 lg:grid-cols-12 lg:gap-10">
      <div className="flex min-w-0 flex-col gap-8 lg:col-span-8">
        <TicketFormHeader copyLine="Customer copy" title={ticket.subject} referenceNumber={ticket.referenceNumber} />
        <PlyRow plies={plies} />
        <TicketThread
          description={ticket.description}
          createdAt={ticket.createdAt}
          support={support}
          emailOffered={emailOffered}
        />
      </div>
      <div className="lg:col-span-4">
        <OfficeUse ticket={ticket} plies={plies} badges={badges} />
      </div>
    </article>
  );
}
