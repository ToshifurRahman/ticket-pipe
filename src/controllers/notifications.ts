import { zValidator } from '@hono/zod-validator';
import { createFactory } from 'hono/factory';
import { z } from 'zod';
import { clientIp } from '../lib/client-ip.js';
import {
  confirmNotification,
  getNotificationView,
  NotificationError,
  previewConfirmation,
  requestNotification,
} from '../services/customer-notifications.js';

const factory = createFactory();

const OptInSchema = z.object({
  email: z.string().max(254),
  // Sent by the widget; checked server-side once story 7.5 lands, like on ticket submission.
  turnstileToken: z.string().max(4096).optional(),
});
const ConfirmSchema = z.object({ token: z.string().min(1).max(256) });
const invalid = (_: unknown, c: { json: (body: unknown, status: 400) => Response }) => c.json({ error: 'Invalid request body' }, 400);

function fail(c: { json: (body: unknown, status: NotificationError['status']) => Response }, err: unknown) {
  if (err instanceof NotificationError) return c.json({ error: err.message }, err.status);
  throw err;
}

export const getStatus = factory.createHandlers(async (c) => {
  return c.json(await getNotificationView(c.req.param('id') as string));
});

export const optIn = factory.createHandlers(
  zValidator('json', OptInSchema, (result, c) => (result.success ? undefined : invalid(result, c))),
  async (c) => {
    try {
      const view = await requestNotification(c.req.param('id') as string, c.req.valid('json').email, clientIp(c));
      return c.json(view, 201);
    } catch (err) {
      return fail(c, err);
    }
  }
);

export const preview = factory.createHandlers(async (c) => {
  return c.json(await previewConfirmation(c.req.param('token') as string));
});

export const confirm = factory.createHandlers(
  zValidator('json', ConfirmSchema, (result, c) => (result.success ? undefined : invalid(result, c))),
  async (c) => {
    try {
      return c.json(await confirmNotification(c.req.valid('json').token));
    } catch (err) {
      return fail(c, err);
    }
  }
);
