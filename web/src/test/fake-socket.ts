import { vi } from 'vitest';

type Handler = (...args: unknown[]) => void;

/**
 * A stand-in for the shared socket.io client. Use it with
 * `vi.mock('@/lib/socket', () => ({ getSocket: () => fakeSocket }))` (create it in
 * `vi.hoisted`). `serverEmit` plays an event from the server; `connect()` fires `connect`.
 */
export function createFakeSocket() {
  const handlers = new Map<string, Set<Handler>>();
  const socket = {
    connected: false,
    handlers,
    on: vi.fn((event: string, handler: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: Handler) => void handlers.get(event)?.delete(handler)),
    emit: vi.fn(),
    connect: vi.fn(() => {
      socket.connected = true;
      socket.serverEmit('connect');
    }),
    disconnect: vi.fn(() => {
      socket.connected = false;
    }),
    serverEmit(event: string, ...args: unknown[]) {
      for (const handler of [...(handlers.get(event) ?? [])]) handler(...args);
    },
    reset() {
      handlers.clear();
      socket.connected = false;
      socket.on.mockClear();
      socket.off.mockClear();
      socket.emit.mockClear();
      socket.connect.mockClear();
      socket.disconnect.mockClear();
    },
  };
  return socket;
}

export type FakeSocket = ReturnType<typeof createFakeSocket>;
