import { zValidator } from '@hono/zod-validator';
import { createFactory } from 'hono/factory';
import { z } from 'zod';
import { listAiInteractions, summarizeAiInteractions } from '../repositories/ai-interactions.js';
import { getTicketById } from '../repositories/tickets.js';
import { buildFullTicketView } from '../services/ticket-views.js';
import { createEventPageHandlers } from './tickets.js';

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

const factory = createFactory();

const invalidQuery = (result: { success: boolean }, c: { json: (body: unknown, status: 400) => Response }) =>
  result.success ? undefined : c.json({ error: 'Invalid query parameters' }, 400);

export const listAiInteractionsHandler = factory.createHandlers(
  zValidator('query', ListQuerySchema, invalidQuery),
  async (c) => c.json(await listAiInteractions(c.req.valid('query')))
);

export const summarizeAiInteractionsHandler = factory.createHandlers(
  zValidator('query', SummaryQuerySchema, invalidQuery),
  async (c) => {
    const query = c.req.valid('query');
    const until = query.until ?? new Date();
    const since = query.since ?? new Date(until.getTime() - DEFAULT_SUMMARY_WINDOW_MS);
    const summary = await summarizeAiInteractions({ since, until });
    return c.json({ since, until, summary });
  }
);

// TODO(6.5): require the ops session. Until then these are as open as the rest of /api/ops.
// The ops console's view of one ticket: every stage output and the event detail that the
// customer routes leave out.
export const getTicketHandler = factory.createHandlers(async (c) => {
  const ticket = await getTicketById(c.req.param('id') as string);
  return c.json(await buildFullTicketView(ticket));
});

// TODO(6.5): require the ops session.
export const listTicketEventsHandler = createEventPageHandlers((event) => event);
