import { assertLlmModeAllowed } from '../apps/api/src/lib/llm-client.js';
import { logger } from '../apps/api/src/lib/logger.js';
import { main } from '../apps/api/src/main.js';

// Test-only: the API and the worker in one process, so Playwright starts (and stops) one
// thing and a ticket submitted in a test is actually processed. Run with LLM_MODE=fake (see
// playwright.config.ts). The production entry point is main.ts; this keeps the e2e-only
// guard and the short long-poll.

assertLlmModeAllowed();
if (process.env.LLM_MODE !== 'fake') throw new Error('e2e/stack.ts only runs with LLM_MODE=fake');

// A short long-poll. When a stack is killed, SQS keeps its open receive alive on the server
// and hands the next message to the dead connection, which hides it for the 30s visibility
// timeout. With the default 20s wait, a test starting right after the previous run would
// lose its first ticket.
try {
  await main({ receiveWaitTimeSeconds: 1 });
  process.exit(process.exitCode ?? 0);
} catch (err) {
  logger.error({ err }, 'e2e stack exited unexpectedly');
  process.exit(1);
}
