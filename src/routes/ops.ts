import { Router } from 'express';
import { listAiInteractionsHandler, summarizeAiInteractionsHandler } from '../controllers/ops.js';

export const opsRouter = Router();

opsRouter.get('/ai-interactions', listAiInteractionsHandler);
opsRouter.get('/ai-interactions/summary', summarizeAiInteractionsHandler);
