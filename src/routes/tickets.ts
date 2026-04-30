import { Router } from 'express';
import { create, getById, getByRef, list, replay } from '../controllers/tickets.js';

export const ticketsRouter = Router();

ticketsRouter.get('/', list);
ticketsRouter.post('/', create);
ticketsRouter.get('/ref/:referenceNumber', getByRef);
ticketsRouter.get('/:id', getById);
ticketsRouter.post('/:id/replay', replay);
