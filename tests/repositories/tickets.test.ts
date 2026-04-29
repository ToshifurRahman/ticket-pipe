import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { pool } from '../../src/lib/db.js';
import {
  insertTicket,
  getTicketById,
  updateTicketStatus,
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
