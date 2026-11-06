import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  drainWithTimeout,
  onShutdownSignal,
  runShutdown,
  SHUTDOWN_TIMEOUT_MS,
} from '../../src/lifecycle.js';

describe('drainWithTimeout', () => {
  it('returns true when the work settles before the timeout', async () => {
    await expect(drainWithTimeout(Promise.resolve(), 1000)).resolves.toBe(true);
  });

  it('returns false when the work is still running at the timeout', async () => {
    const never = new Promise<void>(() => {});
    await expect(drainWithTimeout(never, 10)).resolves.toBe(false);
  });

  it('propagates a failure instead of turning it into a timeout', async () => {
    await expect(drainWithTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
  });
});

describe('SHUTDOWN_TIMEOUT_MS', () => {
  it('leaves room inside the 30s grace period Render gives before SIGKILL', () => {
    expect(SHUTDOWN_TIMEOUT_MS).toBe(25_000);
  });
});

describe('runShutdown', () => {
  it('runs the steps one at a time, in order', async () => {
    const calls: string[] = [];
    const step = (name: string, ms: number) => ({
      name,
      run: async () => {
        calls.push(`${name}:start`);
        await new Promise((resolve) => setTimeout(resolve, ms));
        calls.push(`${name}:end`);
      },
    });

    await expect(runShutdown([step('a', 20), step('b', 1)], 1000)).resolves.toBe('completed');
    expect(calls).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('keeps going after a step fails', async () => {
    const calls: string[] = [];
    const result = await runShutdown(
      [
        {
          name: 'bad',
          run: () => {
            throw new Error('boom');
          },
        },
        { name: 'good', run: () => void calls.push('good') },
      ],
      1000
    );

    expect(result).toBe('completed');
    expect(calls).toEqual(['good']);
  });

  it('puts one deadline over all the steps, not one per step', async () => {
    const slow = (name: string) => ({
      name,
      run: () => new Promise((resolve) => setTimeout(resolve, 60)),
    });

    await expect(runShutdown([slow('a'), slow('b'), slow('c')], 100)).resolves.toBe('timed-out');
  });
});

describe('onShutdownSignal', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calls the handler once and forces exit 1 on a second signal', () => {
    const exit = vi.fn() as unknown as (code: number) => never;
    const handler = vi.fn();
    const dispose = onShutdownSignal(handler, { exit });

    process.emit('SIGTERM');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('SIGTERM');
    expect(exit).not.toHaveBeenCalled();

    process.emit('SIGINT');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);

    dispose();
  });

  it('removes its listeners when disposed', () => {
    const before = process.listenerCount('SIGTERM');
    const dispose = onShutdownSignal(vi.fn());
    expect(process.listenerCount('SIGTERM')).toBe(before + 1);
    dispose();
    expect(process.listenerCount('SIGTERM')).toBe(before);
  });
});
