import { purgeExpiredTickets, RETENTION_DAYS } from '../src/services/ticket-retention.js';
import { pool } from '../src/lib/db.js';

const deleted = await purgeExpiredTickets();
console.log(`Deleted ${deleted} ticket(s) older than ${RETENTION_DAYS} days.`);
await pool.end();
