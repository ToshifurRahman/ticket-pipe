import { PlyRow } from '@/components/ticket/ply-row';
import { FormHeader } from '@/components/form/form-header';
import { FormFoot, FormPanel } from '@/components/form/form-panel';
import { TicketThread } from '@/components/ticket/ticket-thread';
import { Button } from '@/components/ui/button';
import { DEMO_MESSAGE, DEMO_REFERENCE, DEMO_REPLY, DEMO_SUBJECT } from './demo-script';
import { useDemoPlayback } from './use-demo-playback';

// A sample ticket that plays through the real form header, ply stack and thread. It is
// decoration: screen readers get one summary instead of the fake stages.
export function DemoTicket({ className }: { className?: string }) {
  const { frame, canReplay, replay } = useDemoPlayback();

  return (
    <FormPanel aria-label="Example ticket" className={className}>
      <p className="sr-only">
        Example: a customer asks for a refund of a duplicate charge. The ticket is received, triaged as a high
        priority billing issue, and answered with: {DEMO_REPLY}
      </p>
      <div aria-hidden>
        <FormHeader
          as="h2"
          kicker="Service ticket · Sample copy"
          title={DEMO_SUBJECT}
          referenceNumber={DEMO_REFERENCE}
        />
        <PlyRow plies={frame.plies} liveClock />
        <div className="p-4 sm:p-5.5">
          <TicketThread demo description={DEMO_MESSAGE} createdAt={new Date(0).toISOString()} support={frame.support} />
        </div>
      </div>
      {canReplay && (
        <FormFoot className="justify-end">
          <Button variant="outline" size="sm" onClick={replay}>
            Replay
          </Button>
        </FormFoot>
      )}
    </FormPanel>
  );
}
