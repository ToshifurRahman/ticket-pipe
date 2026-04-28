import { pool } from '../lib/db.js';

export interface ProcessingResult {
  category: string;
  priority: string;
  sentiment: string;
  escalate: boolean;
  recommendedTeam: string;
  issueSummary: string;
  customerReply: string;
  internalNote: string;
  nextSteps: string[];
}

export async function getProcessingResultByTicketId(
  ticketId: string
): Promise<ProcessingResult | null> {
  const result = await pool.query(
    'SELECT * FROM ticket_processing WHERE ticket_id = $1',
    [ticketId]
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    category: row.category,
    priority: row.priority,
    sentiment: row.sentiment,
    escalate: row.escalate,
    recommendedTeam: row.recommended_team,
    issueSummary: row.issue_summary,
    customerReply: row.customer_reply,
    internalNote: row.internal_note,
    nextSteps: row.next_steps,
  };
}

export async function insertProcessingResult(
  ticketId: string,
  result: ProcessingResult
): Promise<void> {
  await pool.query(
    `INSERT INTO ticket_processing
       (ticket_id, category, priority, sentiment, escalate,
        recommended_team, issue_summary, customer_reply, internal_note, next_steps)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      ticketId,
      result.category,
      result.priority,
      result.sentiment,
      result.escalate,
      result.recommendedTeam,
      result.issueSummary,
      result.customerReply,
      result.internalNote,
      result.nextSteps,
    ]
  );
}
