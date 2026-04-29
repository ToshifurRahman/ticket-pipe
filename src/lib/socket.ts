import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';

let io: Server | null = null;

export function init(server: HttpServer): Server {
  io = new Server(server, { cors: { origin: '*' } });
  io.on('connection', (socket) => {
    socket.on('join', (ticketId: string) => {
      socket.join(ticketId);
    });
  });
  return io;
}

export function getIo(): Server | null {
  return io;
}
