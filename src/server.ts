import { app } from './app.js';
import { getEngine } from './lib/socket.js';

// Starts the HTTP server. Socket.io must be initialised first (init() creates the engine
// whose websocket handlers have to be registered here).
export function startServer(port: number) {
  const engine = getEngine();
  if (!engine) throw new Error('Socket.io is not initialised; call init() before startServer()');
  const { websocket } = engine.handler();
  return Bun.serve({
    port,
    // The engine routes websocket upgrades; app.fetch receives (request, server) so the
    // /socket.io/ route can hand the server to it.
    fetch: app.fetch,
    websocket,
    // Engine.IO pings every 25s; Bun's default idle timeout would cut websockets sooner.
    idleTimeout: Math.ceil((2 * engine.opts.pingInterval) / 1000),
  });
}
