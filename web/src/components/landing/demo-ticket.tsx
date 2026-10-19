import { PlyRow } from '@/components/ticket/ply-row';
import { TicketFormHeader } from '@/components/ticket/ticket-form-header';
import { TicketThread } from '@/components/ticket/ticket-thread';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DEMO_MESSAGE, DEMO_REFERENCE, DEMO_REPLY, DEMO_SUBJECT } from './demo-script';
import { useDemoPlayback } from './use-demo-playback';

// A sample ticket that plays through the real form header, ply stack and thread. It is
// decoration: screen readers get one summary instead of the fake stages.
export function DemoTicket({ className }: { className?: string }) {
  const { frame, canReplay, replay } = useDemoPlayback();

  return (
    <section aria-label="Example ticket" className={cn('ruled flex flex-col gap-5 bg-card p-4 text-card-foreground sm:p-6', className)}>
      <p className="sr-only">
        Example: a customer asks for a refund of a duplicate charge. The ticket is received, triaged as a high
        priority billing issue, and answered with: {DEMO_REPLY}
      </p>
      <div aria-hidden className="flex flex-col gap-5">
        <TicketFormHeader
          as="h2"
          neutral
          copyLine="Sample copy"
          title={DEMO_SUBJECT}
          referenceNumber={DEMO_REFERENCE}
          copyable={false}
        />
        <PlyRow plies={frame.plies} liveClock />
        <TicketThread demo description={DEMO_MESSAGE} createdAt={new Date(0).toISOString()} support={frame.support} />
      </div>
      {canReplay && (
        <div className="flex justify-end border-t border-rule pt-4">
          <Button variant="outline" size="sm" onClick={replay}>
            Replay
          </Button>
        </div>
      )}
    </section>
  );
}
