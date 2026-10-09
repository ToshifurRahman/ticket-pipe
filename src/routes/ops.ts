import { Hono } from 'hono';
import { listAiInteractionsHandler, summarizeAiInteractionsHandler } from '../controllers/ops.js';

export const opsRouter = new Hono();

opsRouter.get('/ai-interactions', ...listAiInteractionsHandler);
opsRouter.get('/ai-interactions/summary', ...summarizeAiInteractionsHandler);
