import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { listAiInteractions, summarizeAiInteractions } from '../repositories/ai-interactions.js';

const OPERATIONS = ['triage', 'draft'] as const;
const PROVIDERS = ['primary', 'backup'] as const;
const OUTCOMES = ['success', 'http_error', 'network_error', 'timeout', 'invalid_response'] as const;

const ListQuerySchema = z.object({
  operation: z.enum(OPERATIONS).optional(),
  provider: z.enum(PROVIDERS).optional(),
  outcome: z.enum(OUTCOMES).optional(),
  ticketId: z.string().uuid().optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const SummaryQuerySchema = z.object({
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
});

const DEFAULT_SUMMARY_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function listAiInteractionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  const parsed = ListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters' });
    return;
  }

  try {
    const result = await listAiInteractions(parsed.data);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function summarizeAiInteractionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  const parsed = SummaryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters' });
    return;
  }

  const until = parsed.data.until ?? new Date();
  const since = parsed.data.since ?? new Date(until.getTime() - DEFAULT_SUMMARY_WINDOW_MS);

  try {
    const summary = await summarizeAiInteractions({ since, until });
    res.json({ since, until, summary });
  } catch (err) {
    next(err);
  }
}
