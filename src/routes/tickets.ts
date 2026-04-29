import { Router } from 'express';
import { create, getById, list, replay } from '../controllers/tickets.js';

export const ticketsRouter = Router();

ticketsRouter.get('/', list);
ticketsRouter.post('/', create);
ticketsRouter.get('/:id', getById);
ticketsRouter.post('/:id/replay', replay);
