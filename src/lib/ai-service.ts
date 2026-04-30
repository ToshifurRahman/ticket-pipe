import { triageGraph, draftGraph, type TriageOutput } from './ticket-graph.js';
import type { ProcessingResult } from '../repositories/processing.js';

export class AIService {
  async triage(
    ticketId: string,
    subject: string,
    description: string
  ): Promise<Omit<ProcessingResult, 'customerReply' | 'internalNote' | 'nextSteps'>> {
    const state = await triageGraph.invoke(
      { ticketId, subject, description },
      { metadata: { ticketId } }
    );
    const input = state.triageOutput!;
    return {
      category: input.category,
      priority: input.priority,
      sentiment: input.sentiment,
      escalate: input.escalate,
      recommendedTeam: input.recommended_team,
      issueSummary: input.issue_summary,
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
    const state = await draftGraph.invoke(
      { ticketId, subject, description, triageOutput },
      { metadata: { ticketId } }
    );
    const input = state.draftOutput!;
    return {
      customerReply: input.customer_reply,
      internalNote: input.internal_note,
      nextSteps: input.next_steps,
    };
  }
}
