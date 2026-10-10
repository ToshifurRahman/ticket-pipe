import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSocketInvalidation, type InvalidationMap } from './use-socket-invalidation';

type Handler = () => void;
const fakeSocket = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  return {
    connected: false,
    handlers,
    on: vi.fn((event: string, handler: Handler) => void handlers.set(event, handler)),
    off: vi.fn((event: string) => void handlers.delete(event)),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
});

vi.mock('@/lib/socket', () => ({ getSocket: () => fakeSocket }));

const MAP: InvalidationMap = { 'ticket:update': [['ticket', 'a'], ['tickets']] };

function setup() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
}

describe('useSocketInvalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeSocket.handlers.clear();
  });

  it('invalidates the mapped keys when an event fires, and carries no data into the cache', () => {
    const { invalidate, wrapper } = setup();
    renderHook(() => useSocketInvalidation(MAP), { wrapper });

    fakeSocket.handlers.get('ticket:update')!();

    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['ticket', 'a'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tickets'] });
    expect(fakeSocket.connect).toHaveBeenCalled();
  });

  it('stops listening and disconnects on unmount, so no joined room outlives the page', () => {
    const { wrapper } = setup();
    const { unmount } = renderHook(() => useSocketInvalidation(MAP), { wrapper });
    unmount();
    expect(fakeSocket.handlers.has('ticket:update')).toBe(false);
    expect(fakeSocket.disconnect).toHaveBeenCalled();
  });

  it('does not connect while disabled', () => {
    const { wrapper } = setup();
    renderHook(() => useSocketInvalidation(MAP, { enabled: false }), { wrapper });
    expect(fakeSocket.connect).not.toHaveBeenCalled();
    expect(fakeSocket.handlers.size).toBe(0);
  });

  it('disconnects when it becomes disabled', () => {
    const { wrapper } = setup();
    const { rerender } = renderHook(({ enabled }) => useSocketInvalidation(MAP, { enabled }), {
      wrapper,
      initialProps: { enabled: true },
    });
    expect(fakeSocket.connect).toHaveBeenCalled();

    rerender({ enabled: false });

    expect(fakeSocket.disconnect).toHaveBeenCalled();
    expect(fakeSocket.handlers.has('ticket:update')).toBe(false);
  });

  it('lets a page rejoin its room on connect', () => {
    const { wrapper } = setup();
    const onConnect = vi.fn();
    renderHook(() => useSocketInvalidation(MAP, { onConnect }), { wrapper });
    fakeSocket.handlers.get('connect')!();
    expect(onConnect).toHaveBeenCalledWith(fakeSocket);
  });
});
