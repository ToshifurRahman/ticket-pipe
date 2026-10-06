import { Router } from 'express';
import { create, getById, getByRef, list, listEvents, replay } from '../controllers/tickets.js';

export const ticketsRouter = Router();

ticketsRouter.get('/', list);
ticketsRouter.post('/', create);
ticketsRouter.get('/ref/:referenceNumber', getByRef);
ticketsRouter.get('/:id', getById);
ticketsRouter.get('/:id/events', listEvents);
ticketsRouter.post('/:id/replay', replay);
