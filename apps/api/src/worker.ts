// Over the ~250-line guideline on purpose: one poll loop and one pipeline whose stages share
// the resume-from-failure state, so splitting it would scatter rules that must read together.
import { setTimeout as sleep } from 'node:timers/promises';

import { TicketNotFoundError } from './domain/errors.js';
import { UUID_RE } from './domain/ids.js';
import {
  type ProcessingResult,
  resolveTicketFailureCounts,
  resolveTicketPhases,
  type TicketPhaseStatus,
  type TriageOutput,
} from './domain/ticket-phases.js';
import {
  type DraftFields,
  validateDraftOutput,
  validateProcessingOutput,
  validateTriageOutput,
  type ValidationResult,
} from './domain/validate-output.js';
import { AIService } from './lib/ai-service.js';
import { getConfig, startupConfig } from './lib/config.js';
import { pool } from './lib/db.js';
import { assertLlmModeAllowed } from './lib/llm-client.js';
import { logger } from './lib/logger.js';
import { assertMailConfigured } from './lib/mailer.js';
import { deleteMessage, receiveMessages } from './lib/queue.js';
import { shutdown as shutdownSocket, warmEmitter } from './lib/socket.js';
import { onShutdownSignal, runShutdown } from './lifecycle.js';
import { getAllEventsByTicketId } from './repositories/events.js';
import {
  completeDraftOutput,
  getProcessingResultByTicketId,
  upsertTriageOutput,
} from './repositories/processing.js';
import {
  claimTicketForProcessing,
  getTicketById,
  markTicketCompleted,
  markTicketFailed,
  markTicketNeedsAttention,
} from './repositories/tickets.js';
import { notifyIfDue } from './services/customer-notifications.js';
import { alertNeedsAttention } from './services/ops-alerts.js';
import {
  type FailureReason,
  type NeedsAttentionReason,
  publishNeedsAttention,
  publishTicketFailed,
} from './services/ops-feed.js';
import { recordTicketEvent, type TicketRef } from './services/ticket-events.js';
import { startRetentionSweep } from './services/ticket-retention.js';
import { emitTicketUpdate } from './services/ticket-updates.js';

const aiService = new AIService();

const MAX_SQS_BATCH_SIZE = 10;
const RECEIVE_ERROR_BACKOFF_MS = 1000;
const RECEIVE_ERROR_BACKOFF_MAX_MS = 30_000;
const MAX_ATTEMPTS = 3;
// Triage and draft each get MAX_ATTEMPTS, and those limits fire first with a precise reason.
// This cap only catches everything else (DB errors, finalize errors): once a message has been
// received this many times the ticket is marked failed instead of retried. It must stay below the
// queue's DLQ maxReceiveCount (10), or the message would reach the DLQ with the ticket still
// showing `processing`.
const MAX_RECEIVES = 2 * MAX_ATTEMPTS;

class FinalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FinalizeError';
  }
}

function resolveWorkerConcurrency(configured: number, override?: number): number {
  if (typeof override === 'number' && Number.isInteger(override) && override > 0) {
    return override;
  }
  return configured;
}

// Terminal: the ticket is `failed`, its message is removed, and nothing will pick it up again
// until ops replay it. If the ticket already reached another terminal state, nothing is recorded.
async function setFailed(
  ticket: TicketRef,
  reason: FailureReason,
  detail: string,
  receiptHandle: string
): Promise<void> {
  const ticketId = ticket.id;
  const marked = await markTicketFailed(ticketId, reason);
  if (!marked) {
    logger.warn({ ticketId, reason }, 'Ticket was not queued or processing when marking failed');
    await deleteMessage(receiptHandle);
    return;
  }
  await recordTicketEvent(ticket, 'ticket.failed', detail);
  emitTicketUpdate(ticketId, 'ticket.failed');
  publishTicketFailed(ticket, reason);
  void notifyIfDue(ticketId);
  await deleteMessage(receiptHandle);
  logger.warn({ ticketId, reason }, 'Ticket failed permanently');
}

// `detail` (the raw error text) goes into the ticket's event history only. Ops is told
// *that* a ticket needs attention and a fixed `reason`, never the text itself: it can
// quote AI output or customer content (story 4.5).
// The ops email (story 5.7) goes out only when this call actually moved the ticket into
// needs_attention, so a redelivered message can't send a second email.
async function setNeedsAttention(
  ticket: TicketRef,
  reason: NeedsAttentionReason,
  detail: string,
  receiptHandle: string
): Promise<void> {
  const ticketId = ticket.id;
  await recordTicketEvent(ticket, 'ticket.needs_attention', detail);
  const marked = await markTicketNeedsAttention(ticketId);
  if (!marked) {
    logger.warn({ ticketId }, 'Ticket was not in processing state when marking needs_attention');
  }
  emitTicketUpdate(ticketId, 'ticket.needs_attention');
  publishNeedsAttention(ticket, reason);
  if (marked) {
    void notifyIfDue(ticketId);
    alertNeedsAttention({
      ticketId,
      referenceNumber: ticket.referenceNumber,
      reason,
      occurredAt: new Date(),
    });
  }
  await deleteMessage(receiptHandle);
}

function incompleteOutputDetail(validation: ValidationResult): string {
  return `Incomplete output: missing fields [${validation.missingFields.join(', ')}]`;
}

// The stage ran but its output is unusable. `<stage>.invalid` marks which stage it was, so a
// replay re-runs from there and keeps the stages before it (see resolveTicketPhases).
async function setStageInvalid(
  ticket: TicketRef,
  stage: 'triage' | 'draft',
  validation: ValidationResult,
  receiptHandle: string
): Promise<void> {
  const detail = incompleteOutputDetail(validation);
  await recordTicketEvent(ticket, `${stage}.invalid`, detail);
  emitTicketUpdate(ticket.id, `${stage}.invalid`);
  await setNeedsAttention(ticket, 'incomplete_output', detail, receiptHandle);
}

// A stage is skipped because its saved output is valid. If the history doesn't already say it
// completed (a crash right after the output was saved), record that now so the phases agree.
async function reuseStoredStage(
  ticket: TicketRef,
  stage: 'triage' | 'draft',
  phaseStatus: TicketPhaseStatus
): Promise<void> {
  if (phaseStatus === 'completed') {
    logger.info(
      { ticketId: ticket.id, stage },
      'Stage already completed, reusing its saved output'
    );
    return;
  }
  await recordTicketEvent(ticket, `${stage}.completed`, 'reused stored output');
  emitTicketUpdate(ticket.id, `${stage}.completed`);
  logger.info({ ticketId: ticket.id, stage }, 'Stage output already saved, reusing it');
}

function pickTriageOutput(result: ProcessingResult): TriageOutput {
  return {
    category: result.category,
    priority: result.priority,
    sentiment: result.sentiment,
    escalate: result.escalate,
    recommendedTeam: result.recommendedTeam,
    issueSummary: result.issueSummary,
  };
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

  try {
    await processKnownTicket(ticketId, receiptHandle, attemptNumber, ai);
  } catch (err) {
    // A ticket that does not exist never will: retrying only loops the message until the DLQ.
    if (!(err instanceof TicketNotFoundError)) throw err;
    logger.warn({ ticketId }, 'Ticket not found, dropping message');
    await deleteMessage(receiptHandle);
  }
}

async function processKnownTicket(
  ticketId: string,
  receiptHandle: string,
  attemptNumber: number,
  ai: AIService
): Promise<void> {
  // Past the cap on arrival: the failure could not be recorded on an earlier receive. Do no work.
  if (attemptNumber > MAX_RECEIVES) {
    const ticket = await getTicketById(ticketId);
    await setFailed(ticket, 'processing_error', 'Receive limit exceeded', receiptHandle);
    return;
  }

  try {
    await runPipeline(ticketId, receiptHandle, attemptNumber, ai);
  } catch (err) {
    if (attemptNumber < MAX_RECEIVES) throw err;
    const ticket = await getTicketById(ticketId);
    const reason = err instanceof FinalizeError ? 'finalize_failed' : 'processing_error';
    await setFailed(ticket, reason, (err as Error).message, receiptHandle);
  }
}

async function runPipeline(
  ticketId: string,
  receiptHandle: string,
  attemptNumber: number,
  ai: AIService
): Promise<void> {
  const events = await getAllEventsByTicketId(ticketId);
  const phases = resolveTicketPhases(events);
  const failureCounts = resolveTicketFailureCounts(events);

  const ticket = await getTicketById(ticketId);

  if (
    ticket.status === 'completed' ||
    ticket.status === 'needs_attention' ||
    ticket.status === 'failed'
  ) {
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

  // The saved output, not the event history, decides whether a stage is skipped: a stage whose
  // output is already saved and valid never runs again. That covers a resume after a replay, a
  // retry, and a crash between saving the output and recording `*.completed`. A stage that runs
  // makes every later stage's saved output stale, so those run too.
  const stored = await getProcessingResultByTicketId(ticketId);

  // TRIAGE STAGE
  let triageOutput: TriageOutput;
  let triageRan = false;

  if (stored && validateTriageOutput(stored).valid) {
    triageOutput = pickTriageOutput(stored);
    await reuseStoredStage(ticket, 'triage', phases.triage.status);
  } else {
    if (phases.triage.status === 'completed') {
      logger.warn(
        { ticketId },
        'Triage is marked completed but its saved output is missing or invalid; running it again'
      );
    }
    if (failureCounts.triage >= MAX_ATTEMPTS) {
      await setFailed(
        ticket,
        'triage_retries_exhausted',
        'Max triage attempts reached',
        receiptHandle
      );
      return;
    }

    try {
      await recordTicketEvent(ticket, 'triage.started');
      emitTicketUpdate(ticketId, 'triage.started');
      triageOutput = await ai.triage(ticketId, ticket.subject, ticket.description);
      await upsertTriageOutput(ticketId, triageOutput);
    } catch (err) {
      const message = (err as Error).message;
      await recordTicketEvent(ticket, 'triage.failed', message);
      emitTicketUpdate(ticketId, 'triage.failed');
      if (failureCounts.triage + 1 >= MAX_ATTEMPTS) {
        await setFailed(ticket, 'triage_retries_exhausted', message, receiptHandle);
        return;
      }
      throw err;
    }
    triageRan = true;

    // Checked before the draft: a draft written from unusable triage would be thrown away anyway.
    const validation = validateTriageOutput(triageOutput);
    if (!validation.valid) {
      await setStageInvalid(ticket, 'triage', validation, receiptHandle);
      return;
    }
    await recordTicketEvent(ticket, 'triage.completed');
    emitTicketUpdate(ticketId, 'triage.completed');
    logger.info({ ticketId }, 'Triage complete');
  }

  // DRAFT STAGE
  if (!triageRan && stored && validateDraftOutput(stored).valid) {
    await reuseStoredStage(ticket, 'draft', phases.draft.status);
  } else {
    if (!triageRan && phases.draft.status === 'completed') {
      logger.warn(
        { ticketId },
        'Draft is marked completed but its saved output is missing or invalid; running it again'
      );
    }
    if (failureCounts.draft >= MAX_ATTEMPTS) {
      await setFailed(
        ticket,
        'draft_retries_exhausted',
        'Max draft attempts reached',
        receiptHandle
      );
      return;
    }

    let draft: DraftFields;
    try {
      await recordTicketEvent(ticket, 'draft.started');
      emitTicketUpdate(ticketId, 'draft.started');
      const output = await ai.draft(ticketId, ticket.subject, ticket.description, triageOutput);
      await completeDraftOutput(ticketId, output);
      draft = output;
    } catch (err) {
      const message = (err as Error).message;
      await recordTicketEvent(ticket, 'draft.failed', message);
      emitTicketUpdate(ticketId, 'draft.failed');
      if (failureCounts.draft + 1 >= MAX_ATTEMPTS) {
        await setFailed(ticket, 'draft_retries_exhausted', message, receiptHandle);
        return;
      }
      throw err;
    }

    const validation = validateDraftOutput(draft);
    if (!validation.valid) {
      await setStageInvalid(ticket, 'draft', validation, receiptHandle);
      return;
    }
    await recordTicketEvent(ticket, 'draft.completed');
    emitTicketUpdate(ticketId, 'draft.completed');
    logger.info({ ticketId }, 'Draft complete');
  }

  // VALIDATE OUTPUTS
  // Each stage is validated as it runs; this re-checks the saved row as a whole before finalizing.
  const processingResult = await getProcessingResultByTicketId(ticketId);
  if (!processingResult) {
    await setNeedsAttention(
      ticket,
      'processing_result_missing',
      'Processing result not found',
      receiptHandle
    );
    return;
  }

  const validation = validateProcessingOutput(processingResult);
  if (!validation.valid) {
    await setNeedsAttention(
      ticket,
      'incomplete_output',
      incompleteOutputDetail(validation),
      receiptHandle
    );
    return;
  }

  // FINALIZE
  try {
    const markedCompleted = await markTicketCompleted(ticketId);
    if (!markedCompleted) {
      throw new Error(`Unable to mark ticket ${ticketId} as completed`);
    }

    await recordTicketEvent(ticket, 'ticket.completed');
    // Like every other stage, the customer's room gets only the event name. The page
    // refetches the public view, so no stage output travels over the socket.
    emitTicketUpdate(ticketId, 'ticket.completed');
    void notifyIfDue(ticketId);
  } catch (err) {
    // Not marked failed here: the receive-cap handler in processMessage does that once retries run out.
    throw new FinalizeError((err as Error).message);
  }

  await deleteMessage(receiptHandle);
  logger.info({ ticketId }, 'Ticket completed');
}

export interface RunOptions {
  concurrency?: number;
  stopWhenIdle?: boolean;
  receiveWaitTimeSeconds?: number;
  signal?: AbortSignal;
}

function abortPromise(signal: AbortSignal | undefined): Promise<void> {
  if (!signal) return new Promise(() => {});
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener('abort', () => resolve(), { once: true })
  );
}

function isAbortError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === 'AbortError' || name === 'RequestAbortedError';
}

export async function run(options: RunOptions = {}): Promise<void> {
  const concurrency = resolveWorkerConcurrency(getConfig().WORKER_CONCURRENCY, options.concurrency);
  const waitTimeSeconds = options.receiveWaitTimeSeconds;
  const signal = options.signal;
  const aborted = abortPromise(signal);
  const inFlight = new Set<Promise<void>>();
  let receiveBackoffMs = RECEIVE_ERROR_BACKOFF_MS;
  let receiveFailing = false;

  logger.info({ concurrency }, 'Worker started, polling...');

  while (!signal?.aborted) {
    if (inFlight.size >= concurrency) {
      await Promise.race([Promise.race(inFlight), aborted]);
      continue;
    }

    const availableSlots = Math.min(concurrency - inFlight.size, MAX_SQS_BATCH_SIZE);

    let messages;
    try {
      messages = await receiveMessages({ maxMessages: availableSlots, waitTimeSeconds, signal });
    } catch (err) {
      if (signal?.aborted || isAbortError(err)) break;
      // Log loudly once per outage, then quietly, so a missing queue does not flood the log.
      if (receiveFailing)
        logger.warn(
          { err, retryInMs: receiveBackoffMs },
          'Still failing to receive queue messages'
        );
      else logger.error({ err, retryInMs: receiveBackoffMs }, 'Failed to receive queue messages');
      receiveFailing = true;
      try {
        await sleep(receiveBackoffMs, undefined, { signal });
      } catch (sleepErr) {
        if (signal?.aborted || isAbortError(sleepErr)) break;
        throw sleepErr;
      }
      receiveBackoffMs = Math.min(receiveBackoffMs * 2, RECEIVE_ERROR_BACKOFF_MAX_MS);
      continue;
    }

    if (receiveFailing) logger.info('Queue receive recovered');
    receiveFailing = false;
    receiveBackoffMs = RECEIVE_ERROR_BACKOFF_MS;

    if (messages.length === 0) {
      if (options.stopWhenIdle && inFlight.size === 0) {
        break;
      }
      if (inFlight.size > 0) {
        await Promise.race([Promise.race(inFlight), aborted]);
      }
      continue;
    }

    for (const { ticketId, receiptHandle, attemptNumber } of messages) {
      const task = processMessage(ticketId, receiptHandle, attemptNumber)
        .catch((err) => {
          logger.error({ err, ticketId }, 'Failed to process ticket');
        })
        .finally(() => {
          inFlight.delete(task);
        });
      inFlight.add(task);
    }
  }

  if (signal?.aborted) {
    logger.info({ inFlight: inFlight.size }, 'Worker stopping; draining in-flight work');
  }
  await Promise.all(inFlight);
}

if (import.meta.main) {
  startupConfig();
  assertLlmModeAllowed();
  assertMailConfigured();
  const controller = new AbortController();
  const stopRetentionSweep = startRetentionSweep();

  const workerDone = run({ signal: controller.signal }).catch((err) => {
    if (!controller.signal.aborted) throw err;
  });

  onShutdownSignal((signal) => {
    logger.info({ signal }, 'Worker shutting down');
    void runShutdown([
      {
        name: 'worker-drain',
        run: () => {
          controller.abort();
          return workerDone;
        },
      },
      { name: 'retention-sweep', run: stopRetentionSweep },
      { name: 'socket-redis', run: shutdownSocket },
      { name: 'postgres', run: () => pool.end() },
    ]).then((result) => process.exit(result === 'completed' ? 0 : 1));
  });

  // Connect the notification emitter now rather than on the first event, which would be
  // dropped. Not awaited: processing must never wait on Redis (story 4.3).
  void warmEmitter();

  workerDone.catch((err) => {
    logger.error({ err }, 'Worker exited unexpectedly');
    process.exit(1);
  });
}
