import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import {
  getOpsEvents,
  getOpsTicket,
  listAiInteractions,
  opsKeys,
} from '@/lib/ops-api';
import { groupTimeline, humanize, replayStage, stateReason } from '@/lib/ops-ticket';
import type { AiInteraction, OpsTicketDetail } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ReplayButton } from './replay-button';
import { OpsStatusBadge } from './status-badge';

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
  const { data: ticket, error, refetch } = useQuery({ queryKey: opsKeys.ticket(ticketId), queryFn: () => getOpsTicket(ticketId) });

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="p-6">
        <SheetTitle className="text-lg font-semibold">Ticket not found</SheetTitle>
        <SheetDescription className="mt-2 text-sm text-muted-foreground">
          It may have been removed. Close this panel to go back to the list.
        </SheetDescription>
      </div>
    );
  }
  if (!ticket) {
    return (
      <div className="p-6">
        <SheetTitle className="text-lg font-semibold">{error ? "Couldn't load the ticket" : 'Loading…'}</SheetTitle>
        <SheetDescription className="sr-only">Ticket details</SheetDescription>
        {error ? (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Try again
          </Button>
        ) : (
          <div className="mt-4 h-24 animate-pulse rounded-xl bg-muted" />
        )}
      </div>
    );
  }

  const reason = stateReason(ticket);
  const stage = replayStage(ticket.status, ticket.phases);
  const canReplay = ticket.status === 'failed' || ticket.status === 'needs_attention';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-3 border-b border-border p-6 pr-14">
        <div className="flex flex-wrap items-center gap-3">
          <SheetTitle className="min-w-0 text-lg font-semibold break-words">{ticket.subject}</SheetTitle>
          <OpsStatusBadge status={ticket.status} />
        </div>
        <SheetDescription asChild>
          <span className="font-mono text-xs text-muted-foreground">{ticket.referenceNumber}</span>
        </SheetDescription>
        {reason && <p className="text-sm text-warning">{reason}</p>}
        {canReplay && <ReplayButton ticketId={ticket.id} reference={ticket.referenceNumber} stage={stage} />}
      </header>

      <div className="flex-1 space-y-8 overflow-y-auto p-6">
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
    <section className="space-y-3">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
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
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Field label="Category" value={humanize(out.category)} />
            <Field label="Priority" value={humanize(out.priority)} />
            <Field label="Sentiment" value={humanize(out.sentiment)} />
            <Field label="Escalate" value={out.escalate ? 'Yes' : 'No'} />
            <Field label="Team" value={humanize(out.recommendedTeam)} />
          </dl>
          <p className="text-sm">
            <span className="text-muted-foreground">Summary · </span>
            {out.issueSummary}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No triage result yet.</p>
      )}
    </Section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Messages({ ticket }: { ticket: OpsTicketDetail }) {
  const draft = ticket.phases.draft.output;
  return (
    <>
      <Section title="Customer message">
        <p className="rounded-lg border border-border bg-card/60 p-3 text-sm whitespace-pre-wrap break-words">{ticket.description}</p>
      </Section>
      <Section title="Draft">
        {draft ? (
          <div className="space-y-4 text-sm">
            <Block label="Customer reply" text={draft.customerReply} />
            <Block label="Internal note" text={draft.internalNote} />
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Next actions</p>
              {draft.nextActions.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5">
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
          <p className="text-sm text-muted-foreground">No draft yet.</p>
        )}
      </Section>
    </>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <p className="rounded-lg border border-border bg-card/60 p-3 whitespace-pre-wrap break-words">{text}</p>
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
        <p role="alert" className="text-sm text-muted-foreground">Couldn't load the timeline.</p>
      ) : (
        <ol className="space-y-2 text-sm">
          {items.map((item, i) => (
            <li key={`${item.event}-${i}`} className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-mono text-xs">
                {item.event}
                {item.count > 1 && <span className="text-muted-foreground"> ×{item.count}</span>}
              </span>
              <span className="text-xs text-muted-foreground">{new Date(item.occurredAt).toLocaleTimeString()}</span>
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
        <Button variant="outline" size="sm" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          Load more
        </Button>
      )}
    </Section>
  );
}

function AiCalls({ ticketId }: { ticketId: string }) {
  const { data, isError } = useQuery({ queryKey: opsKeys.ai(ticketId), queryFn: () => listAiInteractions(ticketId) });
  // The API lists newest first; a ticket's story reads oldest first.
  const calls: AiInteraction[] = [...(data?.interactions ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <Section title="AI calls">
      {isError ? (
        <p role="alert" className="text-sm text-muted-foreground">Couldn't load the AI calls.</p>
      ) : calls.length === 0 ? (
        <p className="text-sm text-muted-foreground">No AI calls recorded.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">Step</th>
                <th scope="col" className="py-1 pr-3 font-medium">Model</th>
                <th scope="col" className="py-1 pr-3 font-medium">Latency</th>
                <th scope="col" className="py-1 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id} className="border-t border-border/60">
                  <td className="py-2 pr-3">{call.operation}</td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {call.model}
                    {call.provider === 'backup' && (
                      <span className="ml-2 border border-border px-1.5 py-0.5 font-sans text-xs text-muted-foreground">fallback</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{(call.durationMs / 1000).toFixed(1)}s</td>
                  <td className={cn('py-2', call.outcome === 'success' ? 'text-success' : 'text-destructive')}>
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

