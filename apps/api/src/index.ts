import { pool } from './lib/db.js';
import { assertLlmModeAllowed } from './lib/llm-client.js';
import { logger } from './lib/logger.js';
import { assertMailConfigured } from './lib/mailer.js';
import { assertOpsTokenConfigured } from './lib/ops-session.js';
import { init as initSocket, shutdown as shutdownSocket } from './lib/socket.js';
import { onShutdownSignal, runShutdown } from './lifecycle.js';
import { httpCloser, startServer } from './server.js';

export { app } from './app.js';
export { logger };

if (import.meta.main) {
  assertLlmModeAllowed();
  assertMailConfigured();
  assertOpsTokenConfigured();
  const port = Number(process.env.PORT ?? 3000);
  initSocket()
    .then(() => {
      const server = startServer(port);
      logger.info({ port }, 'Server started');

      onShutdownSignal((signal) => {
        logger.info({ signal }, 'Shutting down');
        const http = httpCloser(server);
        void runShutdown([
          { name: 'http-stop', run: () => http.begin() },
          { name: 'socket-redis', run: shutdownSocket },
          { name: 'http-closed', run: () => http.finish() },
          { name: 'postgres', run: () => pool.end() },
        ]).then((result) => process.exit(result === 'completed' ? 0 : 1));
      });
    })
    .catch((err) => {
      logger.error({ err }, 'Failed to initialize socket.io / Redis adapter');
      process.exit(1);
    });
}
