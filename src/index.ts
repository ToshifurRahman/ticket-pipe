import { logger } from './lib/logger.js';
import { assertLlmModeAllowed } from './lib/llm-client.js';
import { assertOpsTokenConfigured } from './lib/ops-session.js';
import { init as initSocket, shutdown as shutdownSocket } from './lib/socket.js';
import { startServer } from './server.js';

export { app } from './app.js';
export { logger };

// Without this the Redis pub/sub clients are never closed and the process has to be
// killed rather than asked to stop. Guarded by `closing` so a second Ctrl-C while the
// first shutdown is still draining doesn't start a second one.
function installShutdownHandlers(server: ReturnType<typeof startServer>): void {
  let closing = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      if (closing) return;
      closing = true;
      logger.info({ signal }, 'Shutting down');
      void shutdownSocket()
        .catch((err) => logger.error({ err }, 'Error shutting down socket.io / Redis'))
        .finally(async () => {
          await server.stop();
          process.exit(0);
        });
    });
  }
}

if (import.meta.main) {
  assertLlmModeAllowed();
  assertOpsTokenConfigured();
  const port = Number(process.env.PORT ?? 3000);
  initSocket()
    .then(() => {
      const server = startServer(port);
      logger.info({ port }, 'Server started');
      installShutdownHandlers(server);
    })
    .catch((err) => {
      logger.error({ err }, 'Failed to initialize socket.io / Redis adapter');
      process.exitCode = 1;
    });
}
