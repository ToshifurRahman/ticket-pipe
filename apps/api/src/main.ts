import { startupConfig } from './lib/config.js';
import { pool } from './lib/db.js';
import { assertLlmModeAllowed } from './lib/llm-client.js';
import { logger } from './lib/logger.js';
import { assertMailConfigured } from './lib/mailer.js';
import { assertOpsTokenConfigured } from './lib/ops-session.js';
import { init as initSocket, shutdown as shutdownSocket, warmEmitter } from './lib/socket.js';
import { onShutdownSignal, runShutdown } from './lifecycle.js';
import { httpCloser, startServer } from './server.js';
import { startRetentionSweep } from './services/ticket-retention.js';
import { run } from './worker.js';

export interface MainOptions {
  receiveWaitTimeSeconds?: number;
}

/**
 * Runs the API and the worker in one process.
 *
 * Resolves after a signal has stopped the HTTP server, drained in-flight work and closed
 * Redis and Postgres. A shutdown that runs past the deadline exits the process directly
 * because in-flight work may never finish; a second signal does the same.
 */
export async function main(options: MainOptions = {}): Promise<void> {
  const { PORT: port } = startupConfig();
  assertLlmModeAllowed();
  assertMailConfigured();
  assertOpsTokenConfigured();

  await initSocket();
  const server = startServer(port);
  logger.info({ port }, 'Server started');

  const stopRetentionSweep = startRetentionSweep();

  let receivedSignal: NodeJS.Signals | null = null;
  let resolveSignal!: (signal: NodeJS.Signals) => void;
  const signalReceived = new Promise<NodeJS.Signals>((resolve) => {
    resolveSignal = resolve;
  });
  const removeSignalHandlers = onShutdownSignal((signal) => {
    receivedSignal = signal;
    resolveSignal(signal);
  });

  // Connect the emitter now rather than on the first event, which would be dropped.
  // Not awaited: request handling must never wait on Redis.
  void warmEmitter();

  const controller = new AbortController();
  let workerError: unknown;
  let workerFailed = false;
  const workerDone = run({
    signal: controller.signal,
    receiveWaitTimeSeconds: options.receiveWaitTimeSeconds,
  }).catch((err) => {
    if (controller.signal.aborted) return;
    workerError = err;
    workerFailed = true;
  });

  try {
    await Promise.race([signalReceived, workerDone]);
    const signal = receivedSignal;
    if (signal) logger.info({ signal }, 'Shutting down');
    else logger.error('Worker stopped without a shutdown signal; shutting down');

    const http = httpCloser(server);
    const result = await runShutdown([
      // Stops accepting connections now; finished after the sockets are closed.
      { name: 'http-stop', run: () => http.begin() },
      {
        name: 'worker-drain',
        run: () => {
          controller.abort();
          return workerDone;
        },
      },
      { name: 'retention-sweep', run: stopRetentionSweep },
      { name: 'socket-redis', run: shutdownSocket },
      { name: 'http-closed', run: () => http.finish() },
      { name: 'postgres', run: () => pool.end() },
    ]);
    if (result === 'timed-out') process.exit(1);

    if (workerFailed) throw workerError;
    if (!signal) throw new Error('Worker exited unexpectedly');
  } finally {
    removeSignalHandlers();
  }
}

if (import.meta.main) {
  main()
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((err) => {
      logger.error({ err }, 'Server exited unexpectedly');
      process.exit(1);
    });
}
