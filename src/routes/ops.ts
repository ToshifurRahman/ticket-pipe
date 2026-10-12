import { Hono } from 'hono';
import {
  getTicketHandler,
  listAiInteractionsHandler,
  listTicketEventsHandler,
  summarizeAiInteractionsHandler,
} from '../controllers/ops.js';
import { requireOpsSession } from '../lib/ops-auth.js';

export const opsRouter = new Hono();

// Everything here is staff-only: it includes raw model errors and full ticket content.
opsRouter.use('*', requireOpsSession);

opsRouter.get('/ai-interactions', ...listAiInteractionsHandler);
opsRouter.get('/ai-interactions/summary', ...summarizeAiInteractionsHandler);
opsRouter.get('/tickets/:id', ...getTicketHandler);
opsRouter.get('/tickets/:id/events', ...listTicketEventsHandler);
