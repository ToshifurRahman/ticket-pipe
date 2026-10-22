import { useState } from 'react';
import { FormHeader } from '@/components/form/form-header';
import { FormPanel } from '@/components/form/form-panel';
import { RecentTickets } from '@/components/new-ticket/recent-tickets';
import { TicketForm } from '@/components/new-ticket/ticket-form';
import { TicketSuccess } from '@/components/new-ticket/ticket-success';
import { useRecentTickets } from '@/lib/recent-tickets';

export function NewTicketPage() {
  const { tickets, remember, forget } = useRecentTickets();
  const [created, setCreated] = useState<{ ref: string; createdAt: string } | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <div className="animate-print-in-1">
        <h1 className="text-[clamp(2.25rem,5vw,4rem)] leading-none font-bold tracking-[-0.035em] text-balance">How can we help?</h1>
        <p className="mt-4 max-w-[36em] text-lg text-muted-foreground">
          Describe the problem and you'll get a tracking link right away. Most replies arrive within a minute.
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,1fr)_340px] md:items-start">
        {created ? (
          <TicketSuccess referenceNumber={created.ref} createdAt={created.createdAt} onSubmitAnother={() => setCreated(null)} />
        ) : (
          <FormPanel enter>
            <FormHeader as="h2" kicker="Service ticket · New" title="Describe the problem" referenceNumber="To be assigned" />
            <TicketForm
              onCreated={(ticket, subject) => {
                remember({ ref: ticket.referenceNumber, subject, createdAt: ticket.createdAt });
                setCreated({ ref: ticket.referenceNumber, createdAt: ticket.createdAt });
              }}
            />
          </FormPanel>
        )}

        <aside className="min-w-0">
          <RecentTickets tickets={tickets} onForget={forget} />
        </aside>
      </div>
    </div>
  );
}
