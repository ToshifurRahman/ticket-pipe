import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'url';
import { logger } from './lib/logger.js';
import { receiveMessages, deleteMessage } from './lib/queue.js';
import {
  getTicketById,
  claimTicketForProcessing,
  markTicketCompleted,
  markTicketFailed,
  markTicketNeedsAttention,
} from './repositories/tickets.js';
import {
  upsertTriageOutput,
  completeDraftOutput,
  getTriageOutputByTicketId,
  getProcessingResultByTicketId,
} from './repositories/processing.js';
import { insertEvent, getEventsByTicketId } from './repositories/events.js';
import { getIo } from './lib/socket.js';
import { AIService } from './lib/ai-service.js';
import { resolveTicketPhases, resolveTicketFailureCounts } from './lib/ticket-phases.js';
import { validateProcessingOutput } from './lib/validate-output.js';

if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY environment variable is required');
if (!process.env.PORTKEY_API_KEY) throw new Error('PORTKEY_API_KEY environment variable is required');

const aiService = new AIService();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SQS_BATCH_SIZE = 10;
const DEFAULT_WORKER_CONCURRENCY = 10;
const RECEIVE_ERROR_BACKOFF_MS = 1000;
const MAX_ATTEMPTS = 3;

function emitTicketUpdate(ticketId: string, event: string): void {
  getIo()?.to(ticketId).emit('ticket:update', { event, ticketId, occurredAt: new Date() });
}

function emitOpsAlert(ticketId: string, detail?: string): void {
  getIo()?.to('ops').emit('ticket:needs_attention', { ticketId, detail, occurredAt: new Date() });
}

function resolveWorkerConcurrency(envValue: string | undefined, override?: number): number {
  if (typeof override === 'number' && Number.isInteger(override) && override > 0) {
    return override;
  }
  if (!envValue) return DEFAULT_WORKER_CONCURRENCY;

  const parsed = Number(envValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    logger.warn(
      { workerConcurrency: envValue, fallback: DEFAULT_WORKER_CONCURRENCY },
      'Invalid WORKER_CONCURRENCY, using default'
    );
    return DEFAULT_WORKER_CONCURRENCY;
  }

  return parsed;
}

async function setFailed(ticketId: string, event: string, detail: string): Promise<void> {
  await insertEvent(ticketId, event, detail);
  emitTicketUpdate(ticketId, event);
  const markedFailed = await markTicketFailed(ticketId);
  if (!markedFailed) {
    logger.warn({ ticketId }, 'Ticket was not in processing state when marking failed');
  }
}

async function setNeedsAttention(ticketId: string, detail: string): Promise<void> {
  await insertEvent(ticketId, 'ticket.needs_attention', detail);
  const marked = await markTicketNeedsAttention(ticketId);
  if (!marked) {
    logger.warn({ ticketId }, 'Ticket was not in processing state when marking needs_attention');
  }
  emitTicketUpdate(ticketId, 'ticket.needs_attention');
  emitOpsAlert(ticketId, detail);
}

export async function processMessage(
  ticketId: string,
  receiptHandle: string,
  attemptNumber: number,
  ai: AIService = aiService
): Promise<void> {
  if (!UUID_RE.test(ticketId)) {
    logger.warn({ ticketId }, 'Skipping message with invalid ticketId');
    await deleteMessage(receiptHandle);
    return;
  }

  const events = await getEventsByTicketId(ticketId);
  const phases = resolveTicketPhases(events);
  const failureCounts = resolveTicketFailureCounts(events);

  const ticket = await getTicketById(ticketId);

  if (ticket.status === 'completed' || ticket.status === 'needs_attention') {
    logger.info({ ticketId, status: ticket.status }, 'Skipping terminal-state ticket');
    await deleteMessage(receiptHandle);
    return;
  }

  const claimed = await claimTicketForProcessing(ticketId);
  if (!claimed && attemptNumber === 1) {
    logger.info({ ticketId }, 'Skipping duplicate or non-queued ticket message');
    await deleteMessage(receiptHandle);
    return;
  }

  logger.info({ ticketId }, 'Processing ticket');

  // TRIAGE STAGE
  let triageOutput: Awaited<ReturnType<typeof getTriageOutputByTicketId>>;

  if (phases.triage.status === 'completed') {
    triageOutput = await getTriageOutputByTicketId(ticketId);
    logger.info({ ticketId }, 'Triage already completed, resuming from draft');
  } else {
    if (failureCounts.triage >= MAX_ATTEMPTS) {
      await setNeedsAttention(ticketId, 'Max triage attempts reached');
      return;
    }

    try {
      await insertEvent(ticketId, 'triage.started');
      emitTicketUpdate(ticketId, 'triage.started');
      triageOutput = await ai.triage(ticketId, ticket.subject, ticket.description);
      await upsertTriageOutput(ticketId, triageOutput!);
      await insertEvent(ticketId, 'triage.completed');
      emitTicketUpdate(ticketId, 'triage.completed');
      logger.info({ ticketId }, 'Triage complete');
    } catch (err) {
      const message = (err as Error).message;
      await insertEvent(ticketId, 'triage.failed', message);
      emitTicketUpdate(ticketId, 'triage.failed');
      if (failureCounts.triage + 1 >= MAX_ATTEMPTS) {
        await setNeedsAttention(ticketId, message);
        return;
      }
      throw err;
    }
  }

  // DRAFT STAGE
  if (failureCounts.draft >= MAX_ATTEMPTS) {
    await setNeedsAttention(ticketId, 'Max draft attempts reached');
    return;
  }

  try {
    await insertEvent(ticketId, 'draft.started');
    emitTicketUpdate(ticketId, 'draft.started');
    const draft = await ai.draft(ticketId, ticket.subject, ticket.description, triageOutput!);
    await completeDraftOutput(ticketId, draft);
    await insertEvent(ticketId, 'draft.completed');
    emitTicketUpdate(ticketId, 'draft.completed');
    logger.info({ ticketId }, 'Draft complete');
  } catch (err) {
    const message = (err as Error).message;
    await insertEvent(ticketId, 'draft.failed', message);
    emitTicketUpdate(ticketId, 'draft.failed');
    if (failureCounts.draft + 1 >= MAX_ATTEMPTS) {
      await setNeedsAttention(ticketId, message);
      return;
    }
    throw err;
  }

  // VALIDATE OUTPUTS
  const processingResult = await getProcessingResultByTicketId(ticketId);
  if (!processingResult) {
    await setNeedsAttention(ticketId, 'Processing result not found');
    return;
  }

  const validation = validateProcessingOutput(processingResult);
  if (!validation.valid) {
    const detail = `Incomplete output: missing fields [${validation.missingFields.join(', ')}]`;
    await setNeedsAttention(ticketId, detail);
    return;
  }

  // FINALIZE
  try {
    const markedCompleted = await markTicketCompleted(ticketId);
    if (!markedCompleted) {
      throw new Error(`Unable to mark ticket ${ticketId} as completed`);
    }

    await insertEvent(ticketId, 'ticket.completed');
    emitTicketUpdate(ticketId, 'ticket.completed');
  } catch (err) {
    const message = (err as Error).message;
    await setFailed(ticketId, 'ticket.failed', message);
    throw err;
  }

  await deleteMessage(receiptHandle);
  logger.info({ ticketId }, 'Ticket completed');
}

export interface RunOptions {
  concurrency?: number;
  stopWhenIdle?: boolean;
  receiveWaitTimeSeconds?: number;
}

export async function run(options: RunOptions = {}): Promise<void> {
  const concurrency = resolveWorkerConcurrency(process.env.WORKER_CONCURRENCY, options.concurrency);
  const waitTimeSeconds = options.receiveWaitTimeSeconds;
  const inFlight = new Set<Promise<void>>();

  logger.info({ concurrency }, 'Worker started, polling...');

  while (true) {
    if (inFlight.size >= concurrency) {
      await Promise.race(inFlight);
      continue;
    }

    const availableSlots = Math.min(concurrency - inFlight.size, MAX_SQS_BATCH_SIZE);

    let messages;
    try {
      messages = await receiveMessages({ maxMessages: availableSlots, waitTimeSeconds });
    } catch (err) {
      logger.error({ err }, 'Failed to receive queue messages');
      await sleep(RECEIVE_ERROR_BACKOFF_MS);
      continue;
    }

    if (messages.length === 0) {
      if (options.stopWhenIdle && inFlight.size === 0) {
        return;
      }
      if (inFlight.size > 0) {
        await Promise.race(inFlight);
      }
      continue;
    }

    for (const { ticketId, receiptHandle, attemptNumber } of messages) {
      const task = processMessage(ticketId, receiptHandle, attemptNumber)
        .catch(err => {
          logger.error({ err, ticketId }, 'Failed to process ticket');
        })
        .finally(() => {
          inFlight.delete(task);
        });
      inFlight.add(task);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch(err => {
    logger.error({ err }, 'Worker exited unexpectedly');
    process.exitCode = 1;
  });
}
