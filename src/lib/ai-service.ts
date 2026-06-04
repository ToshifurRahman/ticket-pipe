import { triage as triageGraph, draft as draftGraph, type TriageOutput } from './ticket-graph.js';
import { triage as triageBackup, draft as draftBackup } from './ticket-graph-backup.js';
import type { ProcessingResult } from '../repositories/processing.js';
import { logger } from './logger.js';

// Check if backup is configured
const isBackupConfigured = !!process.env.BACKUP_API_KEY;

export class AIService {
  async triage(
    ticketId: string,
    subject: string,
    description: string
  ): Promise<Omit<ProcessingResult, 'customerReply' | 'internalNote' | 'nextSteps'>> {
    try {
      const triageOutput = await triageGraph(subject, description);
      return {
        category: triageOutput.category,
        priority: triageOutput.priority,
        sentiment: triageOutput.sentiment,
        escalate: triageOutput.escalate,
        recommendedTeam: triageOutput.recommended_team,
        issueSummary: triageOutput.issue_summary,
      };
    } catch (primaryError) {
      const primaryErrorMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
      // Only try backup if it's configured
      if (!isBackupConfigured) {
        logger.warn(`Primary AI service failed for ticket ${ticketId} and backup is not configured: ${primaryErrorMessage}`);
        throw primaryError;
      }
      
      logger.warn(`Primary AI service failed for ticket ${ticketId}, trying backup: ${primaryErrorMessage}`);
      try {
        const triageOutput = await triageBackup(subject, description);
        logger.info(`Backup AI service succeeded for ticket ${ticketId}`);
        return {
          category: triageOutput.category,
          priority: triageOutput.priority,
          sentiment: triageOutput.sentiment,
          escalate: triageOutput.escalate,
          recommendedTeam: triageOutput.recommended_team,
          issueSummary: triageOutput.issue_summary,
        };
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
    triage: Omit<ProcessingResult, 'customerReply' | 'internalNote' | 'nextSteps'>
  ): Promise<{ customerReply: string; internalNote: string; nextSteps: string[] }> {
    const triageOutput: TriageOutput = {
      category: triage.category,
      priority: triage.priority as TriageOutput['priority'],
      sentiment: triage.sentiment as TriageOutput['sentiment'],
      escalate: triage.escalate,
      recommended_team: triage.recommendedTeam,
      issue_summary: triage.issueSummary,
    };
    
    try {
      const draftOutput = await draftGraph(subject, description, triageOutput);
      return {
        customerReply: draftOutput.customer_reply,
        internalNote: draftOutput.internal_note,
        nextSteps: draftOutput.next_steps,
      };
    } catch (primaryError) {
      const primaryErrorMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
      // Only try backup if it's configured
      if (!isBackupConfigured) {
        logger.warn(`Primary AI service failed for ticket ${ticketId} draft and backup is not configured: ${primaryErrorMessage}`);
        throw primaryError;
      }
      
      logger.warn(`Primary AI service failed for ticket ${ticketId} draft, trying backup: ${primaryErrorMessage}`);
      try {
        const draftOutput = await draftBackup(subject, description, triageOutput);
        logger.info(`Backup AI service succeeded for ticket ${ticketId} draft`);
        return {
          customerReply: draftOutput.customer_reply,
          internalNote: draftOutput.internal_note,
          nextSteps: draftOutput.next_steps,
        };
      } catch (backupError) {
        const backupErrorMessage = backupError instanceof Error ? backupError.message : String(backupError);
        logger.error(`Both primary and backup AI services failed for ticket ${ticketId} draft. Primary: ${primaryErrorMessage}, Backup: ${backupErrorMessage}`);
        throw primaryError; // Throw primary error to maintain existing behavior
      }
    }
  }
}
