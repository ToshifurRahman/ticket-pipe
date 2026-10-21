import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { getOpsEvents, getOpsTicket, listAiInteractions, opsKeys } from '@/lib/ops-api';
import { groupTimeline, humanize, replayStage, stateReason } from '@/lib/ops-ticket';
import type { AiInteraction, OpsTicketDetail } from '@/lib/types';
import { printedTime } from '@/lib/relative-time';
import { cn } from '@/lib/utils';
import { ReplayButton } from './replay-button';
import { OpsStatusBadge } from './status-badge';

const CALL_TH =
  'button-caps border-b border-border py-1.5 pr-2 text-[0.6875rem] whitespace-nowrap text-muted-foreground';
const CALL_TD = 'border-b border-border py-1.5 pr-2';

type TicketDrawerProps = { ticketId: string | null; onClose: () => void };

export function TicketDrawer({ ticketId, onClose }: TicketDrawerProps) {
  return (
    <Sheet open={ticketId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        {ticketId && <TicketDetails key={ticketId} ticketId={ticketId} />}
      </SheetContent>
    </Sheet>
  );
}

function TicketDetails({ ticketId }: { ticketId: string }) {
  const {
    data: ticket,
    error,
    refetch,
  } = useQuery({ queryKey: opsKeys.ticket(ticketId), queryFn: () => getOpsTicket(ticketId) });

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="p-5.5">
        <SheetTitle className="text-xl leading-[1.2] font-semibold">Ticket not found</SheetTitle>
        <SheetDescription className="mt-2 text-sm text-muted-foreground">
          It may have been removed. Close this panel to go back to the list.
        </SheetDescription>
      </div>
    );
  }
  if (!ticket) {
    return (
      <div className="p-5.5">
        <SheetTitle className="text-xl leading-[1.2] font-semibold">
          {error ? "Couldn't load the ticket" : 'Loading…'}
        </SheetTitle>
        <SheetDescription className="sr-only">Ticket details</SheetDescription>
        {error ? (
          <Button variant="tb" className="mt-3" onClick={() => void refetch()}>
            Try again
          </Button>
        ) : (
          <div className="mt-4 h-24 animate-pulse bg-muted" />
        )}
      </div>
    );
  }

  const reason = stateReason(ticket);
  const stage = replayStage(ticket.status, ticket.phases);
  const canReplay = ticket.status === 'failed' || ticket.status === 'needs_attention';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="grid gap-2.5 border-b border-border pt-5.5 pr-24 pb-4.5 pl-5.5">
        <div className="flex flex-wrap items-center gap-3">
          <SheetTitle className="min-w-0 text-xl leading-[1.2] font-semibold break-words">
            {ticket.subject}
          </SheetTitle>
          <OpsStatusBadge status={ticket.status} />
        </div>
        <SheetDescription asChild>
          <span className="font-mono text-xs text-muted-foreground">{ticket.referenceNumber}</span>
        </SheetDescription>
        {reason && <p className="m-0 text-sm text-priority-high">{reason}</p>}
        {canReplay && (
          <ReplayButton ticketId={ticket.id} reference={ticket.referenceNumber} stage={stage} />
        )}
      </header>

      <div className="grid flex-1 content-start gap-7 overflow-y-auto p-5.5">
        <Triage ticket={ticket} />
        <Messages ticket={ticket} />
        <Timeline ticketId={ticket.id} />
        <AiCalls ticketId={ticket.id} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="button-caps m-0 mb-2.5 text-[0.6875rem] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Triage({ ticket }: { ticket: OpsTicketDetail }) {
  const out = ticket.phases.triage.output;
  return (
    <Section title="Triage">
      {out ? (
        <>
          <dl className="m-0 mb-3 grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Category" value={humanize(out.category)} />
            <Field label="Priority" value={humanize(out.priority)} />
            <Field label="Sentiment" value={humanize(out.sentiment)} />
            <Field label="Escalate" value={out.escalate ? 'Yes' : 'No'} />
            <Field label="Team" value={humanize(out.recommendedTeam)} />
          </dl>
          <p className="m-0 text-sm">
            <span className="text-muted-foreground">Summary · </span>
            {out.issueSummary}
          </p>
        </>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">No triage result yet.</p>
      )}
    </Section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 font-semibold">{value}</dd>
    </div>
  );
}

function Messages({ ticket }: { ticket: OpsTicketDetail }) {
  const draft = ticket.phases.draft.output;
  return (
    <>
      <Section title="Customer message">
        <p className="m-0 border border-border px-3 py-2.5 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
          {ticket.description}
        </p>
      </Section>
      <Section title="Draft">
        {draft ? (
          <div className="text-sm">
            <Block label="Customer reply" text={draft.customerReply} first />
            <Block label="Internal note" text={draft.internalNote} />
            <div>
              <p className="mt-2.5 mb-1 text-xs text-muted-foreground">Next actions</p>
              {draft.nextActions.length > 0 ? (
                <ul className="m-0 grid list-disc gap-1 pl-4.5">
                  {draft.nextActions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">None.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="m-0 text-sm text-muted-foreground">No draft yet.</p>
        )}
      </Section>
    </>
  );
}

function Block({ label, text, first = false }: { label: string; text: string; first?: boolean }) {
  return (
    <div>
      <p className={cn('mb-1 text-xs text-muted-foreground', first ? 'mt-0' : 'mt-2.5')}>{label}</p>
      <p className="m-0 border border-border px-3 py-2.5 whitespace-pre-wrap [overflow-wrap:anywhere]">
        {text}
      </p>
    </div>
  );
}

function Timeline({ ticketId }: { ticketId: string }) {
  const query = useInfiniteQuery({
    queryKey: opsKeys.events(ticketId),
    queryFn: ({ pageParam }) => getOpsEvents(ticketId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = groupTimeline(query.data?.pages.flatMap((page) => page.events) ?? []);

  return (
    <Section title="Event timeline">
      {query.isError && !query.data ? (
        <p role="alert" className="m-0 text-sm text-muted-foreground">
          Couldn't load the timeline.
        </p>
      ) : (
        <ol className="m-0 grid list-none gap-2 p-0 font-mono text-xs">
          {items.map((item, i) => (
            <li key={`${item.event}-${i}`} className="flex flex-wrap items-baseline gap-x-3">
              <span>
                {item.event}
                {item.count > 1 && <span className="text-muted-foreground"> ×{item.count}</span>}
              </span>
              <span className="text-muted-foreground">
                {printedTime(item.occurredAt)}
              </span>
              {item.detail && (
                <details className="w-full text-xs text-muted-foreground">
                  <summary className="cursor-pointer">details</summary>
                  <p className="mt-1 whitespace-pre-wrap break-words">{item.detail}</p>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
      {query.hasNextPage && (
        <Button
          variant="tb"
          className="mt-3"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </Section>
  );
}

function AiCalls({ ticketId }: { ticketId: string }) {
  const { data, isError } = useQuery({
    queryKey: opsKeys.ai(ticketId),
    queryFn: () => listAiInteractions(ticketId),
  });
  // The API lists newest first; a ticket's story reads oldest first.
  const calls: AiInteraction[] = [...(data?.interactions ?? [])].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );

  return (
    <Section title="AI calls">
      {isError ? (
        <p role="alert" className="m-0 text-sm text-muted-foreground">
          Couldn't load the AI calls.
        </p>
      ) : calls.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">No AI calls recorded.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[0.8125rem]">
            <thead>
              <tr>
                <th scope="col" className={CALL_TH}>
                  Step
                </th>
                <th scope="col" className={CALL_TH}>
                  Model
                </th>
                <th scope="col" className={CALL_TH}>
                  Latency
                </th>
                <th scope="col" className={CALL_TH}>
                  Outcome
                </th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id}>
                  <td className={CALL_TD}>{call.operation}</td>
                  <td className={cn(CALL_TD, 'font-mono text-xs')}>
                    {call.model}
                    {call.provider === 'backup' && (
                      <span className="ml-1.5 border border-muted-foreground px-1.5 text-[0.6875rem] text-muted-foreground">
                        fallback
                      </span>
                    )}
                  </td>
                  <td className={CALL_TD}>{(call.durationMs / 1000).toFixed(1)}s</td>
                  <td
                    className={cn(
                      CALL_TD,
                      call.outcome === 'success' ? 'text-ply-triaged' : 'text-destructive'
                    )}
                  >
                    {call.outcome === 'success' ? 'ok' : humanize(call.outcome)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
