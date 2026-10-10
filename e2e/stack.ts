import { logger } from '../src/lib/logger.js';
import { assertLlmModeAllowed } from '../src/lib/llm-client.js';
import { init as initSocket, shutdown as shutdownSocket } from '../src/lib/socket.js';
import { startServer } from '../src/server.js';
import { run } from '../src/worker.js';

// Test-only: the API and the worker in one process, so Playwright starts (and stops) one
// thing and a ticket submitted in a test is actually processed. Run with LLM_MODE=fake (see
// playwright.config.ts). Story 7.x's src/main.ts can replace this later.

assertLlmModeAllowed();
if (process.env.LLM_MODE !== 'fake') throw new Error('e2e/stack.ts only runs with LLM_MODE=fake');

const port = Number(process.env.PORT ?? 3100);
// init() also connects the emitter the worker publishes through (no dropped first events).
await initSocket();
const server = startServer(port);
logger.info({ port }, 'e2e stack started (API + worker)');

// A short long-poll. When a stack is killed, SQS keeps its open receive alive on the server
// and hands the next message to the dead connection, which hides it for the 30s visibility
// timeout. With the default 20s wait, a test starting right after the previous run would
// lose its first ticket.
run({ receiveWaitTimeSeconds: 1 }).catch((err) => {
  logger.error({ err }, 'Worker exited unexpectedly');
  process.exitCode = 1;
});

let closing = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void shutdownSocket()
      .catch((err) => logger.error({ err }, 'Error shutting down socket.io / Redis'))
      .finally(async () => {
        await server.stop();
        process.exit(0);
      });
  });
}
