import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getFeedState, subscribeFeedState, type FeedState } from '@/lib/ops-feed-status';
import { getOpsSession, opsKeys, signOut } from '@/lib/ops-api';
import { cn } from '@/lib/utils';

const FEED: Record<FeedState, { label: string; dot: string }> = {
  connected: { label: 'Live feed connected', dot: 'bg-ply-triaged' },
  connecting: { label: 'Connecting…', dot: 'bg-ply-live' },
  offline: { label: 'Feed offline', dot: 'bg-muted-foreground' },
};

// The header's right side: nothing until someone is signed in. The session query is the
// same one the page uses, so signing in or out anywhere updates this too.
export function OpsHeaderActions() {
  const queryClient = useQueryClient();
  const { data: session } = useQuery({ queryKey: opsKeys.session, queryFn: getOpsSession });
  const feed = useSyncExternalStore(subscribeFeedState, getFeedState);
  const out = useMutation({
    mutationFn: signOut,
    onSuccess: () => queryClient.setQueryData(opsKeys.session, { signedIn: false }),
    onError: () => toast.error("Couldn't sign out. Try again."),
  });

  if (!session?.signedIn) return null;
  const { label, dot } = FEED[feed];

  return (
    <>
      <span
        role="status"
        className="flex items-center gap-2 font-mono text-xs text-muted-foreground"
      >
        <span aria-hidden className={cn('size-2', dot)} />
        <span className="sr-only sm:not-sr-only">{label}</span>
      </span>
      <Button variant="tb" disabled={out.isPending} onClick={() => out.mutate()}>
        Sign out
      </Button>
    </>
  );
}
