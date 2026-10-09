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
  getProcessingResultByTicketId,
  type ProcessingResult,
} from './repositories/processing.js';
import { getAllEventsByTicketId } from './repositories/events.js';
import { recordTicketEvent, type TicketRef } from './services/ticket-events.js';
import {
  publishNeedsAttention,
  publishTicketFailed,
  type NeedsAttentionReason,
  type FailureReason,
} from './services/ops-feed.js';
import { alertNeedsAttention } from './services/ops-alerts.js';
import { emitTicketUpdate } from './services/ticket-updates.js';
import { UUID_RE } from './lib/ids.js';
import {
  getEmitter,
  warmEmitter,
  shutdown as shutdownSocket,
  buildTicketCompletedPayload,
  type TicketCompletedPayload,
} from './lib/socket.js';
import { AIService } from './lib/ai-service.js';
import { assertLlmModeAllowed, getLlmMode } from './lib/llm-client.js';
import {
  resolveTicketPhases,
  resolveTicketFailureCounts,
  type TriageOutput,
  type DraftOutput,
  type TicketPhaseStatus,
} from './lib/ticket-phases.js';
import {
  validateProcessingOutput,
  validateTriageOutput,
  validateDraftOutput,
  type DraftFields,
  type ValidationResult,
} from './lib/validate-output.js';

assertLlmModeAllowed();
if (getLlmMode() === 'real') {
  if (!process.env.GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY environment variable is required');
  if (!process.env.PORTKEY_API_KEY) throw new Error('PORTKEY_API_KEY environment variable is required');
}

const aiService = new AIService();

const MAX_SQS_BATCH_SIZE = 10;
const DEFAULT_WORKER_CONCURRENCY = 10;
const RECEIVE_ERROR_BACKOFF_MS = 1000;
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

// Notification delivery must never affect ticket processing: emitTicketUpdate
// (src/services/ticket-updates.ts) and the helper below each catch a synchronous throw
// from the emitter, so it can't propagate into processMessage and be mistaken for a
// processing failure (see getEmitter() in socket.ts for how the underlying async publish
// failures are also contained).
function emitTicketCompleted(payload: TicketCompletedPayload): void {
  try {
    getEmitter().to(payload.ticketId).emit('ticket:update', payload);
  } catch (err) {
    logger.error({ err, ticketId: payload.ticketId }, 'Failed to emit ticket:update');
  }
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
    alertNeedsAttention({ ticketId, referenceNumber: ticket.referenceNumber, reason, occurredAt: new Date() });
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
    logger.info({ ticketId: ticket.id, stage }, 'Stage already completed, reusing its saved output');
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

  if (ticket.status === 'completed' || ticket.status === 'needs_attention' || ticket.status === 'failed') {
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
      logger.warn({ ticketId }, 'Triage is marked completed but its saved output is missing or invalid; running it again');
    }
    if (failureCounts.triage >= MAX_ATTEMPTS) {
      await setFailed(ticket, 'triage_retries_exhausted', 'Max triage attempts reached', receiptHandle);
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
      logger.warn({ ticketId }, 'Draft is marked completed but its saved output is missing or invalid; running it again');
    }
    if (failureCounts.draft >= MAX_ATTEMPTS) {
      await setFailed(ticket, 'draft_retries_exhausted', 'Max draft attempts reached', receiptHandle);
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
    await setNeedsAttention(ticket, 'processing_result_missing', 'Processing result not found', receiptHandle);
    return;
  }

  const validation = validateProcessingOutput(processingResult);
  if (!validation.valid) {
    await setNeedsAttention(ticket, 'incomplete_output', incompleteOutputDetail(validation), receiptHandle);
    return;
  }

  // FINALIZE
  try {
    const markedCompleted = await markTicketCompleted(ticketId);
    if (!markedCompleted) {
      throw new Error(`Unable to mark ticket ${ticketId} as completed`);
    }

    await recordTicketEvent(ticket, 'ticket.completed');
    const triage: TriageOutput = {
      category: processingResult.category,
      priority: processingResult.priority,
      sentiment: processingResult.sentiment,
      escalate: processingResult.escalate,
      recommendedTeam: processingResult.recommendedTeam,
      issueSummary: processingResult.issueSummary,
    };
    const draft: DraftOutput = {
      customerReply: processingResult.customerReply!,
      internalNote: processingResult.internalNote!,
      nextActions: processingResult.nextSteps!,
    };
    emitTicketCompleted(buildTicketCompletedPayload(ticketId, triage, draft));
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
  // The worker has no Socket.IO server, but it does own the emitter's Redis client —
  // without this it never gets closed. Guarded so a repeated signal is a no-op.
  let closing = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      if (closing) return;
      closing = true;
      logger.info({ signal }, 'Worker shutting down');
      void shutdownSocket()
        .catch(err => logger.error({ err }, 'Error shutting down Redis emitter'))
        .finally(() => process.exit(0));
    });
  }

  // Connect the notification emitter now rather than on the first event, which would be
  // dropped. Not awaited: processing must never wait on Redis (story 4.3).
  void warmEmitter();

  run().catch(err => {
    logger.error({ err }, 'Worker exited unexpectedly');
    process.exitCode = 1;
  });
}
