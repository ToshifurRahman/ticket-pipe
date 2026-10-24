import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import { hit } from '../lib/counters.js';
import { getMailer, isMailEnabled, type MailMessage } from '../lib/mailer.js';
import { logger } from '../lib/logger.js';
import { maskEmail } from '../lib/mask-email.js';
import { getTicketById, type Ticket } from '../repositories/tickets.js';
import {
  claimCompleted,
  claimSnag,
  confirmByTokenHash,
  deleteSubscription,
  getNotificationStatus,
  insertSubscription,
  peekByTokenHash,
  recordNotificationError,
  type NotificationState,
} from '../repositories/notifications.js';
import { emitTicketUpdate } from './ticket-updates.js';
import { recordTicketEvent } from './ticket-events.js';
import { buildConfirmEmail, buildReplyReadyEmail, buildSnagEmail, type EmailContext } from './notification-emails.js';

// Customer email (story 6.9): opt-in with a confirmation link, then at most one "reply is ready"
// and one "snag" email per ticket. The address is PII: it is passed to the mailer and nowhere
// else. Never log it, put it in an event, or return it unmasked (tests/notifications.guard.test.ts).

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const OPT_IN_LIMIT_PER_HOUR = 5;
const HOUR_S = 60 * 60;
const DAY_S = 24 * 60 * 60;
const DEFAULT_DAILY_CAP = 250;
let retryDelaysMs = [1000, 4000, 15000];

/** Tests only. */
export function setRetryDelaysForTests(delays: number[]): void {
  retryDelaysMs = delays;
}

export class NotificationError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 410 | 429 | 502 | 503,
    message: string
  ) {
    super(message);
  }
}

const EmailSchema = z.string().trim().toLowerCase().max(254).email();

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const siteUrl = () => (process.env.PUBLIC_SITE_URL ?? '').replace(/\/+$/, '');
const ticketUrl = (ref: string) => `${siteUrl()}/t/${ref}`;

export interface NotificationView {
  available: boolean;
  state: NotificationState;
  maskedEmail?: string;
}

export async function getNotificationView(ticketId: string): Promise<NotificationView> {
  const ticket = await getTicketById(ticketId);
  const { state, email } = await getNotificationStatus(ticket.id);
  return {
    available: isMailEnabled() && (ticket.status !== 'completed' || state !== 'none'),
    state,
    ...(email && { maskedEmail: maskEmail(email) }),
  };
}

async function underDailyCap(): Promise<boolean> {
  const configured = Number(process.env.MAIL_DAILY_CAP);
  const cap = process.env.MAIL_DAILY_CAP && Number.isFinite(configured) ? configured : DEFAULT_DAILY_CAP;
  const day = new Date().toISOString().slice(0, 10);
  return (await hit(`notify:sent:${day}`, DAY_S)) <= cap;
}

export async function requestNotification(ticketId: string, rawEmail: string, ip: string): Promise<NotificationView> {
  const mailer = getMailer();
  if (!mailer) throw new NotificationError(503, 'Email notifications are not available');

  const parsed = EmailSchema.safeParse(rawEmail);
  if (!parsed.success) throw new NotificationError(400, 'Enter a valid email address');
  const email = parsed.data;

  const ticket = await getTicketById(ticketId);
  if (ticket.status === 'completed') throw new NotificationError(409, 'This ticket already has its reply');

  if ((await hit(`notify:optin:${ip}`, HOUR_S)) > OPT_IN_LIMIT_PER_HOUR) {
    throw new NotificationError(429, 'Too many requests, try again later');
  }

  const token = randomBytes(32).toString('base64url');
  const created = await insertSubscription(ticket.id, email, hashToken(token), new Date(Date.now() + TOKEN_TTL_MS));
  if (!created) throw new NotificationError(409, 'An email address is already set for this ticket');

  try {
    if (!(await underDailyCap())) throw new Error('quota');
    await mailer.send({
      to: email,
      ...buildConfirmEmail({ subject: ticket.subject, referenceNumber: ticket.referenceNumber, url: `${siteUrl()}/confirm/${token}` }),
    });
  } catch (err) {
    // Set-once and no resend: leaving the row would strand the customer with no way to retry.
    await deleteSubscription(ticket.id);
    logger.warn({ ticketId: ticket.id, reason: (err as Error).message === 'quota' ? 'quota' : 'send_failed' }, 'Confirmation email not sent');
    throw new NotificationError(502, 'We could not send the confirmation email. Please try again.');
  }

  await recordTicketEvent(ticket, 'notification.requested');
  emitTicketUpdate(ticket.id, 'notification.requested');
  return { available: true, state: 'pending', maskedEmail: maskEmail(email) };
}

/** Read-only look at a confirmation link, for the confirm page. No state changes. */
export async function previewConfirmation(token: string): Promise<{ valid: boolean; referenceNumber?: string; maskedEmail?: string }> {
  const found = await peekByTokenHash(hashToken(token));
  if (!found) return { valid: false };
  const ticket = await getTicketById(found.ticketId);
  return { valid: true, referenceNumber: ticket.referenceNumber, maskedEmail: maskEmail(found.email) };
}

export async function confirmNotification(token: string): Promise<{ referenceNumber: string; status: string; maskedEmail: string }> {
  const ticketId = await confirmByTokenHash(hashToken(token));
  if (!ticketId) throw new NotificationError(410, 'This link has expired or was already used');
  const ticket = await getTicketById(ticketId);
  const { email } = await getNotificationStatus(ticketId);
  await recordTicketEvent(ticket, 'notification.confirmed');
  emitTicketUpdate(ticketId, 'notification.confirmed');
  // The outcome may already have happened while the customer was reading their inbox.
  await notifyIfDue(ticketId);
  return { referenceNumber: ticket.referenceNumber, status: ticket.status, maskedEmail: maskEmail(email ?? '') };
}

type Kind = 'reply_ready' | 'snag';
const inFlight = new Set<Promise<void>>();

/** Settles once every delivery started so far has finished. For tests only. */
export async function pendingNotifications(): Promise<void> {
  while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
}

/**
 * Sends whatever this ticket's current status owes its confirmed subscriber. Safe to call from
 * anywhere and as often as you like: the claim is atomic, so each email goes out once. It never
 * throws, because email must not affect ticket processing.
 */
export async function notifyIfDue(ticketId: string): Promise<void> {
  try {
    if (!isMailEnabled()) return;
    const ticket = await getTicketById(ticketId);
    let kind: Kind;
    let email: string | null;
    if (ticket.status === 'completed') {
      kind = 'reply_ready';
      email = await claimCompleted(ticket.id);
    } else if (ticket.status === 'failed' || ticket.status === 'needs_attention') {
      kind = 'snag';
      email = await claimSnag(ticket.id);
    } else {
      return;
    }
    if (!email) return;
    const delivery = deliver(ticket, kind, email).finally(() => inFlight.delete(delivery));
    inFlight.add(delivery);
  } catch (err) {
    logger.error({ err, ticketId }, 'Customer notification check failed');
  }
}

async function deliver(ticket: Ticket, kind: Kind, email: string): Promise<void> {
  const mailer = getMailer();
  const ctx: EmailContext = { subject: ticket.subject, referenceNumber: ticket.referenceNumber, url: ticketUrl(ticket.referenceNumber) };
  const built = kind === 'reply_ready' ? buildReplyReadyEmail(ctx) : buildSnagEmail(ctx);
  const message: MailMessage = { to: email, ...built };

  let code: string | null = 'send_failed';
  if (!mailer) {
    code = 'mail_off';
  } else if (!(await underDailyCap().catch(() => true))) {
    code = 'quota';
  } else {
    for (let attempt = 0; ; attempt++) {
      try {
        await mailer.send(message);
        code = null;
        break;
      } catch {
        if (attempt >= retryDelaysMs.length) break;
        await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
      }
    }
  }

  if (code === null) {
    // Sent. Recording it is bookkeeping and must not trigger another send.
    await recordTicketEvent(ticket, 'notification.sent', kind).catch((err) =>
      logger.error({ err, ticketId: ticket.id }, 'Could not record notification.sent')
    );
    return;
  }

  try {
    await recordNotificationError(ticket.id, code);
    await recordTicketEvent(ticket, 'notification.failed', `${kind}:${code}`);
  } catch (err) {
    logger.error({ err, ticketId: ticket.id }, 'Could not record notification failure');
  }
  logger.warn({ ticketId: ticket.id, kind, reason: code }, 'Customer email not sent');
}
