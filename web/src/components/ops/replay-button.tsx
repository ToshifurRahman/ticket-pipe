import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { opsKeys, replayTicket } from '@/lib/ops-api';
import type { ReplayStage } from '@/lib/ops-ticket';

function failureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'Already moving again. Nothing to replay.';
    if (error.status === 503) return "Couldn't requeue it, so it was left as it was. Try again.";
  }
  return "Couldn't replay the ticket. Check your connection and try again.";
}

type ReplayButtonProps = { ticketId: string; reference: string; stage: ReplayStage };

// A replay re-spends AI calls, so it asks once first.
export function ReplayButton({ ticketId, reference, stage }: ReplayButtonProps) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const mutation = useMutation({
    mutationFn: () => replayTicket(ticketId),
    onSuccess: () => toast.success(`${reference} replayed. The team re-queued it.`),
    onError: (error) => toast.error(failureMessage(error)),
    onSettled: () => {
      setConfirming(false);
      // The ops feed will also say so, but a 409 means the row is stale right now.
      void queryClient.invalidateQueries({ queryKey: opsKeys.all });
    },
  });

  const label = stage ? `Replay from ${stage}` : 'Replay';

  if (!confirming) {
    return (
      <Button variant="tb" className="justify-self-start" onClick={() => setConfirming(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div role="group" aria-label="Confirm replay" className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}? This spends AI calls.</span>
      <Button
        variant="solid"
        size="sm"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Confirm
      </Button>
      <Button variant="tb" disabled={mutation.isPending} onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  );
}
