import { Router } from 'express';
import { create, getById } from '../controllers/tickets.js';

export const ticketsRouter = Router();

ticketsRouter.post('/', create);
ticketsRouter.get('/:id', getById);
