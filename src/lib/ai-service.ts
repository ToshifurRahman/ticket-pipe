import { triage as triageGraph, draft as draftGraph, type TriageOutput } from './ticket-graph.js';
import type { ProcessingResult } from '../repositories/processing.js';

export class AIService {
  async triage(
    ticketId: string,
    subject: string,
    description: string
  ): Promise<Omit<ProcessingResult, 'customerReply' | 'internalNote' | 'nextSteps'>> {
    const triageOutput = await triageGraph(subject, description);
    return {
      category: triageOutput.category,
      priority: triageOutput.priority,
      sentiment: triageOutput.sentiment,
      escalate: triageOutput.escalate,
      recommendedTeam: triageOutput.recommended_team,
      issueSummary: triageOutput.issue_summary,
    };
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
    const draftOutput = await draftGraph(subject, description, triageOutput);
    return {
      customerReply: draftOutput.customer_reply,
      internalNote: draftOutput.internal_note,
      nextSteps: draftOutput.next_steps,
    };
  }
}
