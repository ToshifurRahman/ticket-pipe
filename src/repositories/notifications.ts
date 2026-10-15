import { pool } from '../lib/db.js';

// Customer email opt-ins (story 6.9). The address lives only in this table. Nothing here may be
// logged or put in an event: callers get it back from a claim and hand it straight to the mailer.

export type NotificationState = 'none' | 'pending' | 'confirmed' | 'sent';

export interface NotificationStatus {
  state: NotificationState;
  email: string | null;
}

/** Returns false when the ticket already has a subscription (the address is set once). */
export async function insertSubscription(
  ticketId: string,
  email: string,
  tokenHash: string,
  expiresAt: Date
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO ticket_notifications (ticket_id, email, token_hash, token_expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (ticket_id) DO NOTHING`,
    [ticketId, email, tokenHash, expiresAt]
  );
  return (rowCount ?? 0) > 0;
}

/** Single use: the hash is cleared on success, so a second click finds nothing. */
export async function confirmByTokenHash(tokenHash: string): Promise<string | null> {
  const { rows } = await pool.query<{ ticket_id: string }>(
    `UPDATE ticket_notifications
        SET confirmed_at = NOW(), token_hash = NULL
      WHERE token_hash = $1 AND token_expires_at > NOW() AND confirmed_at IS NULL
      RETURNING ticket_id`,
    [tokenHash]
  );
  return rows[0]?.ticket_id ?? null;
}

/** What the confirm page may show before anything changes. Null when the link is not usable. */
export async function peekByTokenHash(tokenHash: string): Promise<{ ticketId: string; email: string } | null> {
  const { rows } = await pool.query<{ ticket_id: string; email: string }>(
    `SELECT ticket_id, email FROM ticket_notifications
      WHERE token_hash = $1 AND token_expires_at > NOW() AND confirmed_at IS NULL`,
    [tokenHash]
  );
  return rows[0] ? { ticketId: rows[0].ticket_id, email: rows[0].email } : null;
}

async function claim(column: 'completed_notified_at' | 'snag_notified_at', ticketId: string): Promise<string | null> {
  const { rows } = await pool.query<{ email: string }>(
    `UPDATE ticket_notifications SET ${column} = NOW()
      WHERE ticket_id = $1 AND confirmed_at IS NOT NULL AND ${column} IS NULL
      RETURNING email`,
    [ticketId]
  );
  return rows[0]?.email ?? null;
}

export const claimCompleted = (ticketId: string) => claim('completed_notified_at', ticketId);
export const claimSnag = (ticketId: string) => claim('snag_notified_at', ticketId);

export async function getNotificationStatus(ticketId: string): Promise<NotificationStatus> {
  const { rows } = await pool.query<{ email: string; confirmed_at: Date | null; completed_notified_at: Date | null }>(
    'SELECT email, confirmed_at, completed_notified_at FROM ticket_notifications WHERE ticket_id = $1',
    [ticketId]
  );
  const row = rows[0];
  if (!row) return { state: 'none', email: null };
  if (row.completed_notified_at) return { state: 'sent', email: row.email };
  return { state: row.confirmed_at ? 'confirmed' : 'pending', email: row.email };
}

/** A fixed reason code only, never the provider's error text (it can echo the address). */
export async function recordNotificationError(ticketId: string, code: string): Promise<void> {
  await pool.query('UPDATE ticket_notifications SET last_error = $2 WHERE ticket_id = $1', [ticketId, code]);
}

/** Undoes an opt-in whose confirmation email could not be sent, so the customer can try again. */
export async function deleteSubscription(ticketId: string): Promise<void> {
  await pool.query('DELETE FROM ticket_notifications WHERE ticket_id = $1', [ticketId]);
}
