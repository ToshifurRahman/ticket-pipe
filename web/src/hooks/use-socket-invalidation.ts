import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getSocket } from '@/lib/socket';

/** Socket event name → the query keys it makes stale. Events carry no data we render. */
export type InvalidationMap = Record<string, QueryKey[]>;

/**
 * Socket events only call `invalidateQueries`; the API stays the single source of truth,
 * so ticket phases are never computed on the client. Pass a stable (module-level or
 * memoised) map. `onConnect` lets a page (re)join its room after a reconnect.
 */
export function useSocketInvalidation(map: InvalidationMap, onConnect?: (socket: ReturnType<typeof getSocket>) => void): void {
  const queryClient = useQueryClient();

  useEffect(() => {
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
    };
  }, [map, onConnect, queryClient]);
}
