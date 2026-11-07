import { startupConfig } from '../src/lib/config.js';
import { pool } from '../src/lib/db.js';
import { purgeExpiredTickets, RETENTION_DAYS } from '../src/services/ticket-retention.js';

startupConfig();
const deleted = await purgeExpiredTickets();
console.log(`Deleted ${deleted} ticket(s) older than ${RETENTION_DAYS} days.`);
await pool.end();
