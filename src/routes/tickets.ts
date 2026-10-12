import { Hono } from 'hono';
import { requireOpsSession } from '../lib/ops-auth.js';
import { create, getById, getByRef, list, listEvents, replay } from '../controllers/tickets.js';

export const ticketsRouter = new Hono();

ticketsRouter.get('/', requireOpsSession, ...list);
ticketsRouter.post('/', ...create);
ticketsRouter.get('/ref/:referenceNumber', ...getByRef);
ticketsRouter.get('/:id', ...getById);
ticketsRouter.get('/:id/events', ...listEvents);
ticketsRouter.post('/:id/replay', requireOpsSession, ...replay);
