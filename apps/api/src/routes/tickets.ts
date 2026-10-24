import { Hono } from 'hono';
import { requireOpsSession } from '../lib/ops-auth.js';
import { getStatus, optIn } from '../controllers/notifications.js';
import { create, getById, getByRef, list, listEvents, replay } from '../controllers/tickets.js';

export const ticketsRouter = new Hono();

ticketsRouter.get('/', requireOpsSession, ...list);
ticketsRouter.post('/', ...create);
ticketsRouter.get('/ref/:referenceNumber', ...getByRef);
ticketsRouter.get('/:id', ...getById);
ticketsRouter.get('/:id/events', ...listEvents);
ticketsRouter.get('/:id/notification', ...getStatus);
ticketsRouter.post('/:id/notification', ...optIn);
ticketsRouter.post('/:id/replay', requireOpsSession, ...replay);
