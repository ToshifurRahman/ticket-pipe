import { Hono } from 'hono';
import {
  getTicketHandler,
  listAiInteractionsHandler,
  listTicketEventsHandler,
  summarizeAiInteractionsHandler,
} from '../controllers/ops.js';

export const opsRouter = new Hono();

opsRouter.get('/ai-interactions', ...listAiInteractionsHandler);
opsRouter.get('/ai-interactions/summary', ...summarizeAiInteractionsHandler);
opsRouter.get('/tickets/:id', ...getTicketHandler);
opsRouter.get('/tickets/:id/events', ...listTicketEventsHandler);
