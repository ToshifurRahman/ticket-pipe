import { app } from './app.js';
import { getEngine } from './lib/socket.js';
import { drainWithTimeout } from './lifecycle.js';

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

const HTTP_GRACE_MS = 3000;

/**
 * Two-phase stop. `begin()` stops accepting connections and lets in-flight requests finish.
 * `finish()` waits a short grace period for that, then forces the rest closed: Bun's graceful
 * stop also waits for open websockets, which would hold shutdown until the deadline.
 */
export function httpCloser(server: ReturnType<typeof startServer>) {
  let stopping: Promise<unknown> = Promise.resolve();
  return {
    begin(): void {
      stopping = server.stop();
    },
    async finish(graceMs: number = HTTP_GRACE_MS): Promise<void> {
      if (!(await drainWithTimeout(stopping, graceMs))) await server.stop(true);
    },
  };
}
