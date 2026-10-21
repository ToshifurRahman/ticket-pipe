import { useState } from 'react';
import { RecentTickets } from '@/components/new-ticket/recent-tickets';
import { TicketForm } from '@/components/new-ticket/ticket-form';
import { TicketSuccess } from '@/components/new-ticket/ticket-success';
import { useRecentTickets } from '@/lib/recent-tickets';

export function NewTicketPage() {
  const { tickets, remember, forget } = useRecentTickets();
  const [created, setCreated] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">How can we help?</h1>
        <p className="max-w-xl text-muted-foreground">
          Describe the problem and you’ll get a tracking link right away. Most replies arrive within a minute.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_380px] md:items-start">
        {created ? (
          <TicketSuccess referenceNumber={created} onSubmitAnother={() => setCreated(null)} />
        ) : (
          <div className="rounded-xl border border-border bg-card/60 p-6 sm:p-8">
            <TicketForm
              onCreated={(ticket, subject) => {
                remember({ ref: ticket.referenceNumber, subject, createdAt: ticket.createdAt });
                setCreated(ticket.referenceNumber);
              }}
            />
          </div>
        )}

        <aside>
          <RecentTickets tickets={tickets} onForget={forget} />
        </aside>
      </div>
    </div>
  );
}
