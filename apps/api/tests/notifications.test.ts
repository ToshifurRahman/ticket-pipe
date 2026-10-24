/**
 * Story 6.9 — customer email: double opt-in, one "reply ready" and at most one "snag" per ticket,
 * catch-up on confirm, and nothing leaking into the public view. Uses the in-memory mailer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import request from './helpers/request.js';
import opsRequest from './helpers/ops-session.js';
import { app } from '../src/app.js';
import { pool } from '../src/lib/db.js';
import { closeCounters } from '../src/lib/counters.js';
import { sentMail } from '../src/lib/mailer.js';
import { purgeTicketEvents } from './helpers/purge-ticket-events.js';
import { insertTicket, updateTicketStatus } from '../src/repositories/tickets.js';
import { deleteExpiredTicketBatch } from '../src/repositories/ticket-retention.js';
import {
  notifyIfDue,
  pendingNotifications,
  setRetryDelaysForTests,
} from '../src/services/customer-notifications.js';

process.env.MAIL_DRIVER = 'memory';
process.env.MAIL_FROM = 'relay@example.test';
process.env.PUBLIC_SITE_URL = 'https://relay.test';
process.env.MAIL_DAILY_CAP = '1000000';

const created: string[] = [];
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const optIn = (id: string, email: string, forwardedFor = ip()) =>
  request(app).post(`/api/tickets/${id}/notification`).set('x-forwarded-for', forwardedFor).send({ email });
const tokenFrom = (message: { text: string }) => /\/confirm\/([\w-]+)/.exec(message.text)![1];
const mailTo = (email: string) => sentMail.filter((m) => m.to === email);

async function ticket(status = 'queued') {
  const t = await insertTicket(`TICK-NOTIFY-${randomUUID().slice(0, 8)}`, 'Export broken', 'The CSV export never downloads.');
  created.push(t.id);
  if (status !== 'queued') await updateTicketStatus(t.id, status);
  return t;
}
async function confirmed(status = 'queued') {
  const t = await ticket(status);
  const email = `c-${randomUUID()}@example.test`;
  expect((await optIn(t.id, email)).status).toBe(201);
  const res = await request(app).post('/api/notifications/confirm').send({ token: tokenFrom(mailTo(email)[0]) });
  expect(res.status).toBe(200);
  await pendingNotifications();
  return { t, email };
}

beforeAll(() => setRetryDelaysForTests([1, 1, 1]));
beforeEach(() => {
  sentMail.length = 0;
});
afterAll(async () => {
  await purgeTicketEvents(created);
  await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [created]);
  await pool.end();
  await closeCounters();
});

describe('opt-in', () => {
  it('sends a confirmation with a link and no ticket text, and masks the address', async () => {
    const t = await ticket();
    const email = `opt-${randomUUID()}@example.test`;
    const res = await optIn(t.id, email);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ state: 'pending', maskedEmail: `o•••@example.test` });
    const [mail] = mailTo(email);
    expect(mail.text).toMatch(/https:\/\/relay\.test\/confirm\//);
    expect(mail.text + mail.html).not.toContain('CSV export never downloads');
    expect(JSON.stringify(res.body)).not.toContain(email);
  });

  it('sets the address once', async () => {
    const t = await ticket();
    expect((await optIn(t.id, `a-${randomUUID()}@example.test`)).status).toBe(201);
    expect((await optIn(t.id, `b-${randomUUID()}@example.test`)).status).toBe(409);
  });

  it('rejects a bad address, a completed ticket and an unknown ticket', async () => {
    const t = await ticket();
    expect((await optIn(t.id, 'not-an-email')).status).toBe(400);
    const done = await ticket('completed');
    expect((await optIn(done.id, `d-${randomUUID()}@example.test`)).status).toBe(409);
    expect((await optIn(randomUUID(), `e-${randomUUID()}@example.test`)).status).toBe(404);
  });

  it('limits opt-ins per IP', async () => {
    const same = ip();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await optIn((await ticket()).id, `r-${randomUUID()}@example.test`, same)).status);
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });

  it('removes the opt-in when the confirmation cannot be sent, so the customer can retry', async () => {
    const t = await ticket();
    const cap = process.env.MAIL_DAILY_CAP;
    process.env.MAIL_DAILY_CAP = '0';
    const res = await optIn(t.id, `q-${randomUUID()}@example.test`);
    process.env.MAIL_DAILY_CAP = cap;
    expect(res.status).toBe(502);
    expect((await optIn(t.id, `q2-${randomUUID()}@example.test`)).status).toBe(201);
  });
});

describe('confirmation link', () => {
  it('previews without changing anything, then confirms once', async () => {
    const t = await ticket();
    const email = `p-${randomUUID()}@example.test`;
    await optIn(t.id, email);
    const token = tokenFrom(mailTo(email)[0]);
    const preview = await request(app).get(`/api/notifications/confirm/${token}`);
    expect(preview.body).toMatchObject({ valid: true, referenceNumber: t.referenceNumber });
    expect((await request(app).get(`/api/tickets/${t.id}/notification`)).body.state).toBe('pending');

    expect((await request(app).post('/api/notifications/confirm').send({ token })).status).toBe(200);
    expect((await request(app).post('/api/notifications/confirm').send({ token })).status).toBe(410);
    expect((await request(app).get(`/api/notifications/confirm/${token}`)).body.valid).toBe(false);
    expect((await request(app).get(`/api/tickets/${t.id}/notification`)).body.state).toBe('confirmed');
  });

  it('rejects an expired link', async () => {
    const t = await ticket();
    const email = `x-${randomUUID()}@example.test`;
    await optIn(t.id, email);
    await pool.query("UPDATE ticket_notifications SET token_expires_at = NOW() - interval '1 minute' WHERE ticket_id = $1", [t.id]);
    const res = await request(app).post('/api/notifications/confirm').send({ token: tokenFrom(mailTo(email)[0]) });
    expect(res.status).toBe(410);
  });

  it('does not email anything for an unconfirmed opt-in', async () => {
    const t = await ticket();
    await optIn(t.id, `u-${randomUUID()}@example.test`);
    sentMail.length = 0;
    await updateTicketStatus(t.id, 'completed');
    await notifyIfDue(t.id);
    await pendingNotifications();
    expect(sentMail).toHaveLength(0);
  });
});

describe('outcome emails', () => {
  it('sends "reply ready" exactly once', async () => {
    const { t, email } = await confirmed();
    sentMail.length = 0;
    await updateTicketStatus(t.id, 'completed');
    await notifyIfDue(t.id);
    await notifyIfDue(t.id);
    await pendingNotifications();
    const mail = mailTo(email);
    expect(mail).toHaveLength(1);
    expect(mail[0].text).toContain(`https://relay.test/t/${t.referenceNumber}`);
  });

  it('sends one snag only, and still sends the reply after a replay', async () => {
    const { t, email } = await confirmed();
    sentMail.length = 0;
    for (const status of ['failed', 'needs_attention', 'failed']) {
      await updateTicketStatus(t.id, status);
      await notifyIfDue(t.id);
      await pendingNotifications();
    }
    expect(mailTo(email)).toHaveLength(1);
    expect(mailTo(email)[0].subject).toMatch(/A snag on/);
    await updateTicketStatus(t.id, 'completed');
    await notifyIfDue(t.id);
    await pendingNotifications();
    expect(mailTo(email).map((m) => m.subject)).toEqual([expect.stringMatching(/A snag on/), expect.stringMatching(/reply is ready/)]);
  });

  it.each([
    ['failed', /A snag on/],
    ['needs_attention', /A snag on/],
  ])('catches up on confirm when the ticket is already %s', async (status, subject) => {
    const t = await ticket(status);
    const email = `k-${randomUUID()}@example.test`;
    await optIn(t.id, email);
    await request(app).post('/api/notifications/confirm').send({ token: tokenFrom(mailTo(email)[0]) });
    await pendingNotifications();
    expect(mailTo(email).at(-1)!.subject).toMatch(subject);
  });

  it('catches up on confirm when the reply landed while the customer was reading their inbox', async () => {
    const t = await ticket();
    const email = `l-${randomUUID()}@example.test`;
    await optIn(t.id, email);
    await updateTicketStatus(t.id, 'completed');
    await request(app).post('/api/notifications/confirm').send({ token: tokenFrom(mailTo(email)[0]) });
    await pendingNotifications();
    expect(mailTo(email).at(-1)!.subject).toMatch(/reply is ready/);
  });

  it('records notification.failed (no address) after the retries run out', async () => {
    const { t } = await confirmed();
    const { setMailerForTests } = await import('../src/lib/mailer.js');
    setMailerForTests({ send: async () => Promise.reject(new Error('boom to someone@example.test')) });
    try {
      await updateTicketStatus(t.id, 'completed');
      await notifyIfDue(t.id);
      await pendingNotifications();
    } finally {
      setMailerForTests(null);
    }
    const { rows } = await pool.query('SELECT event, detail FROM ticket_events WHERE ticket_id = $1 AND event LIKE $2', [t.id, 'notification.%']);
    expect(rows.find((r) => r.event === 'notification.failed')).toMatchObject({ detail: 'reply_ready:send_failed' });
    expect(JSON.stringify(rows)).not.toContain('@');
  });
});

describe('what each view shows', () => {
  it('keeps the address and notification events out of the public view, masked in ops', async () => {
    const { t, email } = await confirmed();
    const publicView = await request(app).get(`/api/tickets/${t.id}`);
    expect(JSON.stringify(publicView.body)).not.toContain(email);
    expect(publicView.body.events.some((e: { event: string }) => e.event.startsWith('notification.'))).toBe(false);
    const events = await request(app).get(`/api/tickets/${t.id}/events`);
    expect(events.body.events.some((e: { event: string }) => e.event.startsWith('notification.'))).toBe(false);

    const ops = await opsRequest(app).get(`/api/ops/tickets/${t.id}`);
    expect(ops.body.notification).toEqual({ state: 'confirmed', maskedEmail: 'c•••@example.test' });
    expect(JSON.stringify(ops.body)).not.toContain(email);
    expect(ops.body.events.map((e: { event: string }) => e.event)).toContain('notification.confirmed');
  });
});

describe('retention', () => {
  it('deletes the opt-in with its ticket', async () => {
    const { t } = await confirmed();
    await pool.query("UPDATE tickets SET created_at = NOW() - interval '31 days' WHERE id = $1", [t.id]);
    await deleteExpiredTicketBatch(new Date(Date.now() - 30 * 24 * 3600 * 1000), 500);
    const { rows } = await pool.query('SELECT 1 FROM ticket_notifications WHERE ticket_id = $1', [t.id]);
    expect(rows).toHaveLength(0);
  });
});
