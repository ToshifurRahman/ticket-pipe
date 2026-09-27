import {
  triage as triageLlm,
  draft as draftLlm,
  getPrimaryProvider,
  getBackupProvider,
  isBackupConfigured,
  LlmCallError,
  type LlmProvider,
  type TriageOutput,
} from './llm-client.js';
import type { ProcessingResult } from '../repositories/processing.js';
import { insertAiInteraction, type AiInteractionRecord, type AiOperation } from '../repositories/ai-interactions.js';
import { logger } from './logger.js';

type TriageResult = Omit<ProcessingResult, 'customerReply' | 'internalNote' | 'nextSteps'>;
type DraftResult = { customerReply: string; internalNote: string; nextSteps: string[] };
type AiInteractionRecorder = (record: AiInteractionRecord) => Promise<void>;

export class AIService {
  constructor(private readonly recorder: AiInteractionRecorder = insertAiInteraction) {}

  private async recordInteraction(record: AiInteractionRecord): Promise<void> {
    try {
      await this.recorder(record);
    } catch (err) {
      logger.error({ err, record }, 'Failed to persist AI interaction record');
    }
  }

  private async attempt<T>(
    ticketId: string,
    operation: AiOperation,
    provider: LlmProvider,
    call: () => Promise<{ output: T; usage: { promptTokens: number | null; completionTokens: number | null } }>
  ): Promise<T> {
    const start = performance.now();
    try {
      const { output, usage } = await call();
      const durationMs = Math.round(performance.now() - start);
      await this.recordInteraction({
        ticketId,
        operation,
        provider: provider.name,
        model: provider.model,
        outcome: 'success',
        durationMs,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      });
      logger.info({ ticketId, operation, provider: provider.name, model: provider.model, durationMs }, 'AI call succeeded');
      return output;
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      const outcome = err instanceof LlmCallError ? err.outcome : 'network_error';
      const httpStatus = err instanceof LlmCallError ? err.httpStatus : undefined;
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.recordInteraction({
        ticketId,
        operation,
        provider: provider.name,
        model: provider.model,
        outcome,
        durationMs,
        httpStatus,
        errorMessage,
      });
      logger.warn(
        { ticketId, operation, provider: provider.name, model: provider.model, durationMs, outcome, err },
        'AI call failed'
      );
      throw err;
    }
  }

  async triage(ticketId: string, subject: string, description: string): Promise<TriageResult> {
    const primary = getPrimaryProvider();

    try {
      const output = await this.attempt(ticketId, 'triage', primary, () => triageLlm(primary, subject, description));
      return mapTriageOutput(output);
    } catch (primaryError) {
      const primaryErrorMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
      if (!isBackupConfigured()) {
        logger.warn(`Primary AI service failed for ticket ${ticketId} and backup is not configured: ${primaryErrorMessage}`);
        throw primaryError;
      }

      logger.warn(`Primary AI service failed for ticket ${ticketId}, trying backup: ${primaryErrorMessage}`);
      const backup = getBackupProvider();
      try {
        const output = await this.attempt(ticketId, 'triage', backup, () => triageLlm(backup, subject, description));
        logger.info(`Backup AI service succeeded for ticket ${ticketId}`);
        return mapTriageOutput(output);
      } catch (backupError) {
        const backupErrorMessage = backupError instanceof Error ? backupError.message : String(backupError);
        logger.error(`Both primary and backup AI services failed for ticket ${ticketId}. Primary: ${primaryErrorMessage}, Backup: ${backupErrorMessage}`);
        throw primaryError; // Throw primary error to maintain existing behavior
      }
    }
  }

  async draft(
    ticketId: string,
    subject: string,
    description: string,
    triage: TriageResult
  ): Promise<DraftResult> {
    const triageOutput: TriageOutput = {
      category: triage.category,
      priority: triage.priority as TriageOutput['priority'],
      sentiment: triage.sentiment as TriageOutput['sentiment'],
      escalate: triage.escalate,
      recommended_team: triage.recommendedTeam,
      issue_summary: triage.issueSummary,
    };

    const primary = getPrimaryProvider();

    try {
      const output = await this.attempt(ticketId, 'draft', primary, () => draftLlm(primary, subject, description, triageOutput));
      return mapDraftOutput(output);
    } catch (primaryError) {
      const primaryErrorMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
      if (!isBackupConfigured()) {
        logger.warn(`Primary AI service failed for ticket ${ticketId} draft and backup is not configured: ${primaryErrorMessage}`);
        throw primaryError;
      }

      logger.warn(`Primary AI service failed for ticket ${ticketId} draft, trying backup: ${primaryErrorMessage}`);
      const backup = getBackupProvider();
      try {
        const output = await this.attempt(ticketId, 'draft', backup, () => draftLlm(backup, subject, description, triageOutput));
        logger.info(`Backup AI service succeeded for ticket ${ticketId} draft`);
        return mapDraftOutput(output);
      } catch (backupError) {
        const backupErrorMessage = backupError instanceof Error ? backupError.message : String(backupError);
        logger.error(`Both primary and backup AI services failed for ticket ${ticketId} draft. Primary: ${primaryErrorMessage}, Backup: ${backupErrorMessage}`);
        throw primaryError; // Throw primary error to maintain existing behavior
      }
    }
  }
}

function mapTriageOutput(triageOutput: TriageOutput): TriageResult {
  return {
    category: triageOutput.category,
    priority: triageOutput.priority,
    sentiment: triageOutput.sentiment,
    escalate: triageOutput.escalate,
    recommendedTeam: triageOutput.recommended_team,
    issueSummary: triageOutput.issue_summary,
  };
}

function mapDraftOutput(draftOutput: { customer_reply: string; internal_note: string; next_steps: string[] }): DraftResult {
  return {
    customerReply: draftOutput.customer_reply,
    internalNote: draftOutput.internal_note,
    nextSteps: draftOutput.next_steps,
  };
}
