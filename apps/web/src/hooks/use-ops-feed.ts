import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { setFeedState } from '@/lib/ops-feed-status';
import { opsKeys } from '@/lib/ops-api';
import { getSocket } from '@/lib/socket';

export type OpsAlert = { kind: 'needs_attention' | 'failed'; ticketId: string; referenceNumber: string; reason: string };

type FeedOptions = {
  /** The feed only runs while someone is signed in. */
  enabled: boolean;
  /** The server refused the subscription or revoked the session. */
  onSignedOut: () => void;
  onAlert: (alert: OpsAlert) => void;
};

// Anything the organization feed says may change a row, a count, the KPIs or an open drawer.
const REFRESH_EVENTS = ['ops:ticket_event', 'ticket:requeued', 'ticket:failed', 'ticket:needs_attention'];
// A ticket's five stage events arrive together; one refetch is enough.
const REFRESH_DELAY_MS = 300;

/**
 * Subscribes to the ops room and turns what it hears into query invalidations, so the API
 * stays the source of truth. The server only lets a socket with a live ops session in; an
 * `ok: false` ack or `ops:revoked` means the session is gone.
 */
export function useOpsFeed({ enabled, onSignedOut, onAlert }: FeedOptions): void {
  const queryClient = useQueryClient();
  // Read through refs so new callbacks never tear the socket down and reconnect it.
  const signedOut = useRef(onSignedOut);
  const alert = useRef(onAlert);
  useEffect(() => {
    signedOut.current = onSignedOut;
    alert.current = onAlert;
  });

  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: opsKeys.all }), REFRESH_DELAY_MS);
    };

    const handlers: [string, (...args: never[]) => void][] = REFRESH_EVENTS.map((event) => [event, refresh]);
    const onAlertEvent = (kind: OpsAlert['kind']) => (payload: Record<string, unknown>) => {
      alert.current({
        kind,
        ticketId: String(payload.ticketId),
        referenceNumber: String(payload.referenceNumber),
        reason: String(payload.reason),
      });
    };
    handlers.push(
      ['ticket:needs_attention', onAlertEvent('needs_attention')],
      ['ticket:failed', onAlertEvent('failed')],
      ['ops:revoked', () => signedOut.current()],
      ['disconnect', () => setFeedState('offline')],
      ['connect_error', () => setFeedState('offline')]
    );
    for (const [event, handler] of handlers) socket.on(event, handler as never);

    const subscribe = () => {
      setFeedState('connecting');
      socket.emit('ops:subscribe', (ack?: { ok: boolean }) => {
        if (ack?.ok) {
          setFeedState('connected');
          // Whatever happened while the socket was down (or before it joined) is unseen.
          refresh();
        } else {
          setFeedState('offline');
          signedOut.current();
        }
      });
    };
    socket.on('connect', subscribe);

    setFeedState('connecting');
    if (socket.connected) subscribe();
    else socket.connect();

    return () => {
      clearTimeout(timer);
      for (const [event, handler] of handlers) socket.off(event, handler as never);
      socket.off('connect', subscribe);
      socket.disconnect();
      setFeedState('offline');
    };
  }, [enabled, queryClient]);
}
