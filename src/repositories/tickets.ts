import { pool } from '../lib/db.js';
import { TicketNotFoundError } from '../lib/errors.js';
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

export async function requeueTicket(id: string): Promise<void> {
  await pool.query(
    "UPDATE tickets SET status = 'queued', failure_reason = NULL, failed_at = NULL WHERE id = $1",
    [id]
  );
}

export interface ListTicketsOptions {
  page: number;
  limit: number;
  status?: string[];
  sort: 'createdAt' | 'status' | 'failedAt';
  order: 'asc' | 'desc';
}

export interface ListTicketsResult {
  tickets: Ticket[];
  total: number;
  page: number;
  limit: number;
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
    sort === 'status' ? 'status' : sort === 'failedAt' ? 'failed_at' : 'created_at';
  const orderDir = order.toUpperCase() + (sort === 'failedAt' ? ' NULLS LAST' : '');

  const countQuery = `SELECT COUNT(*) FROM tickets ${whereClause}`;
  const dataQuery = `SELECT * FROM tickets ${whereClause} ORDER BY ${orderBy} ${orderDir} LIMIT $${paramIndex++} OFFSET $${paramIndex}`;

  const countResult = await pool.query(countQuery, params);
  const total = Number(countResult.rows[0].count);

  const dataResult = await pool.query(
    dataQuery,
    [...params, limit, offset]
  );

  return {
    tickets: dataResult.rows.map(mapRow),
    total,
    page,
    limit,
  };
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
