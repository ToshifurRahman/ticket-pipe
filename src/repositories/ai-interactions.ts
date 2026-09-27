import { pool } from '../lib/db.js';

export type AiOperation = 'triage' | 'draft';
export type AiProvider = 'primary' | 'backup';
export type AiOutcome = 'success' | 'http_error' | 'network_error' | 'timeout' | 'invalid_response';

export interface AiInteractionRecord {
  ticketId: string;
  operation: AiOperation;
  provider: AiProvider;
  model: string;
  outcome: AiOutcome;
  durationMs: number;
  httpStatus?: number | null;
  errorMessage?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
}

export interface AiInteraction extends AiInteractionRecord {
  id: string;
  httpStatus: number | null;
  errorMessage: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  createdAt: Date;
}

interface AiInteractionRow {
  id: string;
  ticket_id: string;
  operation: string;
  provider: string;
  model: string;
  outcome: string;
  http_status: number | null;
  duration_ms: number;
  error_message: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at: Date;
}

function mapRow(row: AiInteractionRow): AiInteraction {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    operation: row.operation as AiOperation,
    provider: row.provider as AiProvider,
    model: row.model,
    outcome: row.outcome as AiOutcome,
    httpStatus: row.http_status,
    durationMs: row.duration_ms,
    errorMessage: row.error_message,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    createdAt: row.created_at,
  };
}

export async function insertAiInteraction(record: AiInteractionRecord): Promise<void> {
  await pool.query(
    `INSERT INTO ai_interactions
       (ticket_id, operation, provider, model, outcome, http_status, duration_ms, error_message, prompt_tokens, completion_tokens)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      record.ticketId,
      record.operation,
      record.provider,
      record.model,
      record.outcome,
      record.httpStatus ?? null,
      record.durationMs,
      record.errorMessage ?? null,
      record.promptTokens ?? null,
      record.completionTokens ?? null,
    ]
  );
}

export interface ListAiInteractionsFilters {
  provider?: AiProvider;
  operation?: AiOperation;
  outcome?: AiOutcome;
  ticketId?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
}

export interface ListAiInteractionsResult {
  interactions: AiInteraction[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

export async function listAiInteractions(
  filters: ListAiInteractionsFilters = {}
): Promise<ListAiInteractionsResult> {
  const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, filters.limit ?? DEFAULT_LIST_LIMIT));
  const offset = Math.max(0, filters.offset ?? 0);

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.provider) {
    conditions.push(`provider = $${paramIndex++}`);
    params.push(filters.provider);
  }
  if (filters.operation) {
    conditions.push(`operation = $${paramIndex++}`);
    params.push(filters.operation);
  }
  if (filters.outcome) {
    conditions.push(`outcome = $${paramIndex++}`);
    params.push(filters.outcome);
  }
  if (filters.ticketId) {
    conditions.push(`ticket_id = $${paramIndex++}`);
    params.push(filters.ticketId);
  }
  if (filters.since) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(filters.since);
  }
  if (filters.until) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(filters.until);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM ai_interactions ${whereClause}`,
    params
  );
  const total = Number(countResult.rows[0]!.count);

  const dataResult = await pool.query<AiInteractionRow>(
    `SELECT * FROM ai_interactions ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  );

  return {
    interactions: dataResult.rows.map(mapRow),
    total,
    limit,
    offset,
  };
}

export interface SummarizeAiInteractionsFilters {
  since?: Date;
  until?: Date;
}

export interface AiInteractionSummaryRow {
  operation: AiOperation;
  provider: AiProvider;
  count: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  outcomeCounts: Record<string, number>;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
}

interface SummaryRow {
  operation: string;
  provider: string;
  count: string;
  success_count: string;
  avg_duration_ms: string;
  p50_duration_ms: string;
  p95_duration_ms: string;
  total_prompt_tokens: string | null;
  total_completion_tokens: string | null;
}

interface OutcomeBreakdownRow {
  operation: string;
  provider: string;
  outcome: string;
  count: string;
}

export async function summarizeAiInteractions(
  filters: SummarizeAiInteractionsFilters = {}
): Promise<AiInteractionSummaryRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.since) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(filters.since);
  }
  if (filters.until) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(filters.until);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [summaryResult, breakdownResult] = await Promise.all([
    pool.query<SummaryRow>(
      `SELECT
         operation,
         provider,
         COUNT(*) AS count,
         COUNT(*) FILTER (WHERE outcome = 'success') AS success_count,
         AVG(duration_ms) AS avg_duration_ms,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50_duration_ms,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_duration_ms,
         SUM(prompt_tokens) AS total_prompt_tokens,
         SUM(completion_tokens) AS total_completion_tokens
       FROM ai_interactions
       ${whereClause}
       GROUP BY operation, provider
       ORDER BY operation, provider`,
      params
    ),
    pool.query<OutcomeBreakdownRow>(
      `SELECT operation, provider, outcome, COUNT(*) AS count
       FROM ai_interactions
       ${whereClause}
       GROUP BY operation, provider, outcome`,
      params
    ),
  ]);

  const outcomeCountsByKey = new Map<string, Record<string, number>>();
  for (const row of breakdownResult.rows) {
    const key = `${row.operation}:${row.provider}`;
    const outcomeCounts = outcomeCountsByKey.get(key) ?? {};
    outcomeCounts[row.outcome] = Number(row.count);
    outcomeCountsByKey.set(key, outcomeCounts);
  }

  return summaryResult.rows.map(row => {
    const count = Number(row.count);
    const successCount = Number(row.success_count);
    return {
      operation: row.operation as AiOperation,
      provider: row.provider as AiProvider,
      count,
      successCount,
      failureCount: count - successCount,
      successRate: count > 0 ? successCount / count : 0,
      outcomeCounts: outcomeCountsByKey.get(`${row.operation}:${row.provider}`) ?? {},
      avgDurationMs: Number(row.avg_duration_ms),
      p50DurationMs: Number(row.p50_duration_ms),
      p95DurationMs: Number(row.p95_duration_ms),
      totalPromptTokens: Number(row.total_prompt_tokens ?? 0),
      totalCompletionTokens: Number(row.total_completion_tokens ?? 0),
    };
  });
}
