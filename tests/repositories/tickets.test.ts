import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { pool } from '../../src/lib/db.js';
import {
  insertTicket,
  getTicketById,
  updateTicketStatus,
  markTicketFailed,
  requeueTicket,
  listTickets,
} from '../../src/repositories/tickets.js';

const createdIds: string[] = [];

afterEach(async () => {
  if (createdIds.length) {
    await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [createdIds]);
    createdIds.length = 0;
  }
});

afterAll(async () => {
  await pool.end();
});

describe('insertTicket', () => {
  it('returns a ticket with all fields populated', async () => {
    const ticket = await insertTicket('TICK-TEST-001', 'Login broken', 'Cannot sign in');
    createdIds.push(ticket.id);

    expect(ticket.id).toBeTruthy();
    expect(ticket.referenceNumber).toBe('TICK-TEST-001');
    expect(ticket.subject).toBe('Login broken');
    expect(ticket.description).toBe('Cannot sign in');
    expect(ticket.status).toBe('queued');
    expect(ticket.createdAt).toBeInstanceOf(Date);
  });

  it('rejects duplicate reference numbers', async () => {
    const t = await insertTicket('TICK-TEST-DUP', 'Sub', 'Desc');
    createdIds.push(t.id);

    await expect(insertTicket('TICK-TEST-DUP', 'Sub2', 'Desc2')).rejects.toThrow();
  });
});

describe('getTicketById', () => {
  it('retrieves the correct ticket by id', async () => {
    const inserted = await insertTicket('TICK-TEST-002', 'Billing issue', 'Charged twice');
    createdIds.push(inserted.id);

    const fetched = await getTicketById(inserted.id);

    expect(fetched.id).toBe(inserted.id);
    expect(fetched.subject).toBe('Billing issue');
    expect(fetched.status).toBe('queued');
  });

  it('throws when the ticket does not exist', async () => {
    await expect(
      getTicketById('00000000-0000-0000-0000-000000000000')
    ).rejects.toThrow('Ticket not found');
  });
});

describe('updateTicketStatus', () => {
  it('transitions queued → processing', async () => {
    const ticket = await insertTicket('TICK-TEST-003', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await updateTicketStatus(ticket.id, 'processing');

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('processing');
  });

  it('transitions processing → completed', async () => {
    const ticket = await insertTicket('TICK-TEST-004', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await updateTicketStatus(ticket.id, 'processing');
    await updateTicketStatus(ticket.id, 'completed');

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('completed');
  });

  it('can set status to failed', async () => {
    const ticket = await insertTicket('TICK-TEST-005', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await updateTicketStatus(ticket.id, 'failed');

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('failed');
  });
});

describe('markTicketFailed', () => {
  it('sets status, reason and failed_at together', async () => {
    const t = await insertTicket('TICK-TEST-FAIL-1', 'Sub', 'Desc');
    createdIds.push(t.id);
    await updateTicketStatus(t.id, 'processing');

    expect(await markTicketFailed(t.id, 'draft_retries_exhausted')).toBe(true);

    const updated = await getTicketById(t.id);
    expect(updated.status).toBe('failed');
    expect(updated.failureReason).toBe('draft_retries_exhausted');
    expect(updated.failedAt).toBeInstanceOf(Date);
  });

  it('does not overwrite a completed ticket', async () => {
    const t = await insertTicket('TICK-TEST-FAIL-2', 'Sub', 'Desc');
    createdIds.push(t.id);
    await updateTicketStatus(t.id, 'completed');

    expect(await markTicketFailed(t.id, 'processing_error')).toBe(false);
    expect((await getTicketById(t.id)).status).toBe('completed');
  });

  it('rejects a reason outside the closed set', async () => {
    const t = await insertTicket('TICK-TEST-FAIL-3', 'Sub', 'Desc');
    createdIds.push(t.id);

    await expect(
      pool.query("UPDATE tickets SET failure_reason = 'because' WHERE id = $1", [t.id])
    ).rejects.toThrow();
  });
});

describe('requeueTicket', () => {
  it('clears the failure data', async () => {
    const t = await insertTicket('TICK-TEST-FAIL-4', 'Sub', 'Desc');
    createdIds.push(t.id);
    await markTicketFailed(t.id, 'processing_error');

    await requeueTicket(t.id);

    const updated = await getTicketById(t.id);
    expect(updated.status).toBe('queued');
    expect(updated.failureReason).toBeNull();
    expect(updated.failedAt).toBeNull();
  });
});

describe('listTickets sort by failedAt', () => {
  it('orders failed tickets oldest failure first and puts unfailed tickets last', async () => {
    const a = await insertTicket('TICK-TEST-SORT-A', 'Sub', 'Desc');
    const b = await insertTicket('TICK-TEST-SORT-B', 'Sub', 'Desc');
    const c = await insertTicket('TICK-TEST-SORT-C', 'Sub', 'Desc');
    createdIds.push(a.id, b.id, c.id);
    await markTicketFailed(b.id, 'processing_error');
    await markTicketFailed(a.id, 'processing_error');
    await pool.query("UPDATE tickets SET failed_at = NOW() - interval '1 hour' WHERE id = $1", [b.id]);

    const { tickets } = await listTickets({ page: 1, limit: 100000, sort: 'failedAt', order: 'asc' });
    const ours = tickets.filter(t => [a.id, b.id, c.id].includes(t.id)).map(t => t.id);

    expect(ours).toEqual([b.id, a.id, c.id]);
  });
});
