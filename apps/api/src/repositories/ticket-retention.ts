import { pool } from '../lib/db.js';

/**
 * Deletes one batch of tickets created before `cutoff`, with everything that hangs off them,
 * and returns how many tickets went. `ticket_events` is append-only (migration 008); this is
 * the one application path allowed to remove from it, by opting in for this transaction only
 * (see the allow-list in tests/ticket-events.guard.test.ts).
 */
export async function deleteExpiredTicketBatch(cutoff: Date, batchSize: number): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.allow_event_purge', 'on', true)");
    const { rows } = await client.query<{ id: string }>(
      'SELECT id FROM tickets WHERE created_at < $1 ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED',
      [cutoff, batchSize]
    );
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) {
      await client.query('DELETE FROM ticket_notifications WHERE ticket_id = ANY($1::uuid[])', [ids]);
      await client.query('DELETE FROM ticket_events WHERE ticket_id = ANY($1::uuid[])', [ids]);
      await client.query('DELETE FROM ai_interactions WHERE ticket_id = ANY($1::uuid[])', [ids]);
      await client.query('DELETE FROM ticket_processing WHERE ticket_id = ANY($1::uuid[])', [ids]);
      await client.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [ids]);
    }
    await client.query('COMMIT');
    return ids.length;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
