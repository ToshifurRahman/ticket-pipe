import { pool } from '../lib/db.js';
import { TicketNotFoundError } from '../lib/errors.js';
import { isUuid } from '../lib/ids.js';
import type { FailureReason } from '../services/ops-feed.js';

export interface Ticket {
  id: string;
  referenceNumber: string;
  subject: string;
  description: string;
  status: string;
  createdAt: Date;
  failureReason: FailureReason | null;
  failedAt: Date | null;
}

interface TicketRow {
  id: string;
  reference_number: string;
  subject: string;
  description: string;
  status: string;
  created_at: Date;
  failure_reason: FailureReason | null;
  failed_at: Date | null;
}

export async function insertTicket(
  referenceNumber: string,
  subject: string,
  description: string
): Promise<Ticket> {
  const result = await pool.query<TicketRow>(
    `INSERT INTO tickets (reference_number, subject, description)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [referenceNumber, subject, description]
  );
  const row = result.rows[0];
  return mapRow(row);
}

export async function getTicketById(id: string): Promise<Ticket> {
  // A non-UUID can't match a row, and Postgres would reject it with an error instead of no rows.
  if (!isUuid(id)) throw new TicketNotFoundError(id);
  const result = await pool.query<TicketRow>('SELECT * FROM tickets WHERE id = $1', [id]);
  if (!result.rows[0]) throw new TicketNotFoundError(id);
  return mapRow(result.rows[0]);
}

export async function getTicketByReferenceNumber(referenceNumber: string): Promise<Ticket> {
  const result = await pool.query<TicketRow>('SELECT * FROM tickets WHERE reference_number = $1', [referenceNumber]);
  if (!result.rows[0]) throw new TicketNotFoundError(referenceNumber);
  return mapRow(result.rows[0]);
}

export async function updateTicketStatus(id: string, status: string): Promise<void> {
  await pool.query('UPDATE tickets SET status = $1 WHERE id = $2', [status, id]);
}

export async function claimTicketForProcessing(id: string): Promise<boolean> {
  const result = await pool.query(
    "UPDATE tickets SET status = 'processing' WHERE id = $1 AND status = 'queued'",
    [id]
  );
  return result.rowCount === 1;
}

export async function markTicketCompleted(id: string): Promise<boolean> {
  const result = await pool.query(
    "UPDATE tickets SET status = 'completed' WHERE id = $1 AND status = 'processing'",
    [id]
  );
  return result.rowCount === 1;
}

export async function markTicketFailed(id: string, reason: FailureReason): Promise<boolean> {
  const result = await pool.query(
    `UPDATE tickets SET status = 'failed', failure_reason = $2, failed_at = NOW()
     WHERE id = $1 AND status IN ('queued', 'processing')`,
    [id, reason]
  );
  return result.rowCount === 1;
}

export async function markTicketNeedsAttention(id: string): Promise<boolean> {
  const result = await pool.query(
    "UPDATE tickets SET status = 'needs_attention' WHERE id = $1 AND status = 'processing'",
    [id]
  );
  return result.rowCount === 1;
}

export type ReplayableStatus = 'failed' | 'needs_attention';

// What a ticket looked like before it was requeued, so a failed replay can put it back exactly.
export interface RequeuedFrom {
  status: ReplayableStatus;
  failureReason: FailureReason | null;
  failedAt: Date | null;
}

// Moves a failed or needs_attention ticket back to `queued` in one statement. The row lock
// makes concurrent replays safe: exactly one caller gets the previous state back, every
// other caller (and any ticket in another status) gets null.
export async function requeueTicket(id: string): Promise<RequeuedFrom | null> {
  const result = await pool.query<{ status: ReplayableStatus; failure_reason: FailureReason | null; failed_at: Date | null }>(
    `WITH prev AS (
       SELECT id, status, failure_reason, failed_at FROM tickets
       WHERE id = $1 AND status IN ('failed', 'needs_attention')
       FOR UPDATE
     )
     UPDATE tickets t SET status = 'queued', failure_reason = NULL, failed_at = NULL
     FROM prev WHERE t.id = prev.id
     RETURNING prev.status, prev.failure_reason, prev.failed_at`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { status: row.status, failureReason: row.failure_reason, failedAt: row.failed_at };
}

// Undoes requeueTicket when the replay could not be completed. Only a still-`queued` ticket is
// restored, so a ticket the worker has already claimed is never overwritten.
export async function restoreTicketAfterFailedRequeue(id: string, prev: RequeuedFrom): Promise<boolean> {
  const result = await pool.query(
    `UPDATE tickets SET status = $2, failure_reason = $3, failed_at = $4
     WHERE id = $1 AND status = 'queued'`,
    [id, prev.status, prev.failureReason, prev.failedAt]
  );
  return result.rowCount === 1;
}

export interface ListTicketsOptions {
  page: number;
  limit: number;
  status?: string[];
  sort: 'createdAt' | 'updatedAt' | 'status' | 'failedAt';
  order: 'asc' | 'desc';
}

// A ticket as the ops table lists it: the triage verdict (null until triage has finished)
// and the time of its latest event.
export interface ListedTicket extends Ticket {
  category: string | null;
  priority: string | null;
  updatedAt: Date;
}

export interface ListTicketsResult {
  tickets: ListedTicket[];
  total: number;
  page: number;
  limit: number;
  /** Tickets per status across the whole table, whatever the status filter says. */
  counts: Record<string, number>;
}

export async function listTickets(options: ListTicketsOptions): Promise<ListTicketsResult> {
  const { page, limit, status, sort, order } = options;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (status && status.length > 0) {
    const placeholders = status.map(() => `$${paramIndex++}`).join(', ');
    conditions.push(`status IN (${placeholders})`);
    params.push(...status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy =
    sort === 'status' ? 't.status' : sort === 'failedAt' ? 't.failed_at' : sort === 'updatedAt' ? 'updated_at' : 't.created_at';
  const orderDir = order.toUpperCase() + (sort === 'failedAt' ? ' NULLS LAST' : '');

  const countQuery = `SELECT COUNT(*) FROM tickets t ${whereClause}`;
  // `t.id` breaks ties so a page boundary never repeats or skips a row.
  const dataQuery = `
    SELECT t.*, p.category, p.priority,
           COALESCE((SELECT MAX(e.occurred_at) FROM ticket_events e WHERE e.ticket_id = t.id), t.created_at) AS updated_at
    FROM tickets t
    LEFT JOIN ticket_processing p ON p.ticket_id = t.id
    ${whereClause}
    ORDER BY ${orderBy} ${orderDir}, t.id
    LIMIT $${paramIndex++} OFFSET $${paramIndex}`;

  const [countResult, dataResult, countsResult] = await Promise.all([
    pool.query(countQuery, params),
    pool.query(dataQuery, [...params, limit, offset]),
    pool.query<{ status: string; count: string }>('SELECT status, COUNT(*) FROM tickets GROUP BY status'),
  ]);

  return {
    tickets: dataResult.rows.map((row) => ({
      ...mapRow(row),
      category: row.category ?? null,
      priority: row.priority ?? null,
      updatedAt: row.updated_at,
    })),
    total: Number(countResult.rows[0].count),
    page,
    limit,
    counts: Object.fromEntries(countsResult.rows.map((r) => [r.status, Number(r.count)])),
  };
}

export async function countTicketsCreatedSince(since: Date, until: Date): Promise<number> {
  const result = await pool.query('SELECT COUNT(*) FROM tickets WHERE created_at >= $1 AND created_at <= $2', [since, until]);
  return Number(result.rows[0].count);
}

function mapRow(row: TicketRow): Ticket {
  return {
    id: row.id,
    referenceNumber: row.reference_number,
    subject: row.subject,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    failureReason: row.failure_reason,
    failedAt: row.failed_at,
  };
}
