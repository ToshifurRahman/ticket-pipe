import { pool } from '../../src/lib/db.js';

/**
 * Test cleanup only. `ticket_events` is append-only (migration 008), so deleting rows needs
 * the transaction-local opt-in. The flag ends with the transaction, so the pooled connection
 * goes back to the pool with the protection intact.
 */
export async function purgeTicketEvents(ticketIds: string | string[]): Promise<void> {
  const ids = Array.isArray(ticketIds) ? ticketIds : [ticketIds];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.allow_event_purge', 'on', true)");
    await client.query('DELETE FROM ticket_events WHERE ticket_id = ANY($1::uuid[])', [ids]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
