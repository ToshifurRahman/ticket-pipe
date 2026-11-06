import { logger } from './lib/logger.js';

// Render sends SIGKILL 30s after SIGTERM by default. The whole shutdown has to finish inside
// that window, so this leaves 5s of margin.
export const SHUTDOWN_TIMEOUT_MS = 25_000;

export interface ShutdownStep {
  name: string;
  run: () => unknown;
}

/**
 * Waits for shutdown work to settle, but never longer than `ms`.
 *
 * Returns true when the promise settled in time and false on timeout. A rejection from
 * the promise is propagated; callers decide whether that is a clean stop or an error.
 */
export async function drainWithTimeout(
  promise: Promise<unknown>,
  ms: number = SHUTDOWN_TIMEOUT_MS
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });

  try {
    return await Promise.race([promise.then(() => true), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Runs the steps one at a time, in order, under one deadline for all of them. A step that
 * throws is logged and the rest still run, so one failure cannot leave Redis or Postgres open.
 *
 * Resolves 'timed-out' when the deadline passes first. The caller decides what that means
 * (the entry points exit 1); unfinished steps are abandoned, not cancelled.
 */
export async function runShutdown(
  steps: ShutdownStep[],
  ms: number = SHUTDOWN_TIMEOUT_MS
): Promise<'completed' | 'timed-out'> {
  const all = (async () => {
    for (const step of steps) {
      const started = Date.now();
      logger.info({ step: step.name }, 'Shutdown step started');
      try {
        await step.run();
        logger.info({ step: step.name, durationMs: Date.now() - started }, 'Shutdown step done');
      } catch (err) {
        logger.error({ err, step: step.name }, 'Shutdown step failed');
      }
    }
  })();

  const finished = await drainWithTimeout(all, ms);
  if (!finished) {
    logger.warn({ timeoutMs: ms }, 'Shutdown timed out');
    return 'timed-out';
  }
  logger.info({ steps: steps.map((step) => step.name) }, 'Shutdown complete');
  return 'completed';
}

export interface SignalOptions {
  exit?: (code: number) => never;
}

/**
 * Calls `handler` on the first SIGTERM or SIGINT. A second signal while that shutdown is
 * still running forces exit 1, so a stuck drain can always be interrupted from the terminal.
 * Returns a function that removes the listeners.
 */
export function onShutdownSignal(
  handler: (signal: NodeJS.Signals) => void,
  options: SignalOptions = {}
): () => void {
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const signals = ['SIGTERM', 'SIGINT'] as const;
  let closing = false;

  const listeners = signals.map((signal) => {
    const listener = (): void => {
      if (closing) {
        logger.warn({ signal }, 'Forcing shutdown');
        exit(1);
        return;
      }
      closing = true;
      handler(signal);
    };
    process.on(signal, listener);
    return [signal, listener] as const;
  });

  return () => {
    for (const [signal, listener] of listeners) process.off(signal, listener);
  };
}
