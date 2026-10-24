import { deleteExpiredTicketBatch } from '../repositories/ticket-retention.js';
import { logger } from '../lib/logger.js';

// The privacy page promises this number (web/src/content/legal.ts). Change both together.
export const RETENTION_DAYS = 30;
const BATCH_SIZE = 500;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Hard-deletes every ticket older than the retention window, whatever its status. */
export async function purgeExpiredTickets(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
  let total = 0;
  while (true) {
    const deleted = await deleteExpiredTicketBatch(cutoff, BATCH_SIZE);
    total += deleted;
    if (deleted < BATCH_SIZE) return total;
  }
}

async function sweep(): Promise<void> {
  try {
    const deleted = await purgeExpiredTickets();
    if (deleted > 0) logger.info({ deleted, retentionDays: RETENTION_DAYS }, 'Purged expired tickets');
  } catch (err) {
    logger.error({ err }, 'Retention purge failed');
  }
}

/**
 * Runs the purge now and then hourly. Render free has no cron, so the worker owns it. The timer
 * is unref'd so it never keeps the process alive; call the returned function to stop it.
 * Every process that runs the worker loop must call this (the worker entry point does).
 */
export function startRetentionSweep(): () => void {
  void sweep();
  const timer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
