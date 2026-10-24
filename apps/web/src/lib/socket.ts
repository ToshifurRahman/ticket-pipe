import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

// One lazy, shared connection. Same origin, so the Vite proxy (dev) and Express (prod)
// both serve /socket.io without configuration.
export function getSocket(): Socket {
  socket ??= io({ autoConnect: false });
  return socket;
}

export function resetSocketForTests(): void {
  socket?.disconnect();
  socket = null;
}
