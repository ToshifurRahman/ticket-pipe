import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getSocket } from '@/lib/socket';

/** Socket event name → the query keys it makes stale. Events carry no data we render. */
export type InvalidationMap = Record<string, QueryKey[]>;

type Socket = ReturnType<typeof getSocket>;

export type SocketInvalidationOptions = {
  /** Runs on every (re)connect, so a page can (re)join its room. */
  onConnect?: (socket: Socket) => void;
  /** While false the socket is disconnected. Defaults to true. */
  enabled?: boolean;
};

/**
 * Socket events only call `invalidateQueries`; the API stays the single source of truth,
 * so ticket phases are never computed on the client. Pass a stable (module-level or
 * memoised) map and `onConnect`.
 *
 * The socket disconnects when `enabled` turns false or the component unmounts. The server
 * has no `leave`, so a fresh connection is the only way to drop the rooms joined before.
 */
export function useSocketInvalidation(map: InvalidationMap, options: SocketInvalidationOptions = {}): void {
  const { onConnect, enabled = true } = options;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    const handlers = Object.entries(map).map(([event, keys]) => {
      const handler = () => {
        for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
      };
      socket.on(event, handler);
      return [event, handler] as const;
    });
    const connectHandler = () => onConnect?.(socket);
    socket.on('connect', connectHandler);

    if (!socket.connected) socket.connect();
    else connectHandler();

    return () => {
      for (const [event, handler] of handlers) socket.off(event, handler);
      socket.off('connect', connectHandler);
      socket.disconnect();
    };
  }, [map, onConnect, enabled, queryClient]);
}
