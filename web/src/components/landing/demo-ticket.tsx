import { RotateCcw } from 'lucide-react';
import { StatusPill } from '@/components/new-ticket/status-pill';
import { PlyRow } from '@/components/ticket/ply-row';
import { TicketThread } from '@/components/ticket/ticket-thread';
import { Button } from '@/components/ui/button';
import { DEMO_MESSAGE, DEMO_REFERENCE, DEMO_REPLY, DEMO_SUBJECT } from './demo-script';
import { useDemoPlayback } from './use-demo-playback';

// A sample ticket that plays through the real stepper and thread. It is decoration: screen
// readers get one summary instead of the fake stages.
export function DemoTicket() {
  const { frame, done, canReplay, replay } = useDemoPlayback();

  return (
    <section
      aria-label="Example ticket"
      className="flex flex-col gap-5 rounded-2xl border border-border bg-card/70 p-4 shadow-xl backdrop-blur sm:p-6"
    >
      <p className="sr-only">
        Example: a customer asks for a refund of a duplicate charge. The ticket is received, triaged as a high
        priority billing issue, and answered with: {DEMO_REPLY}
      </p>
      <div aria-hidden className="flex flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold break-words">{DEMO_SUBJECT}</h3>
            <span className="font-mono text-xs text-muted-foreground">{DEMO_REFERENCE}</span>
          </div>
          <StatusPill status={done ? 'completed' : 'processing'} />
        </header>
        <PlyRow plies={frame.plies} />
        <TicketThread demo description={DEMO_MESSAGE} createdAt={new Date(0).toISOString()} support={frame.support} />
      </div>
      {canReplay && (
        <Button variant="ghost" size="sm" className="self-end" onClick={replay}>
          <RotateCcw /> Replay
        </Button>
      )}
    </section>
  );
}
