import { pool } from '../lib/db.js';

export interface Ticket {
  id: string;
  referenceNumber: string;
  subject: string;
  description: string;
  status: string;
  createdAt: Date;
}

interface TicketRow {
  id: string;
  reference_number: string;
  subject: string;
  description: string;
  status: string;
  created_at: Date;
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
  if (!result.rows[0]) throw new Error(`Ticket not found: ${id}`);
  return mapRow(result.rows[0]);
}

export async function updateTicketStatus(id: string, status: string): Promise<void> {
  await pool.query('UPDATE tickets SET status = $1 WHERE id = $2', [status, id]);
}

function mapRow(row: TicketRow): Ticket {
  return {
    id: row.id,
    referenceNumber: row.reference_number,
    subject: row.subject,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
  };
}
