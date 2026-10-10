import { describe, it, expect, afterAll } from 'vitest';
import request from '../helpers/request.js';
import { app } from '../../src/app.js';
import { pool } from '../../src/lib/db.js';
import { insertEvent } from '../../src/repositories/events.js';
import { insertProcessingResult } from '../../src/repositories/processing.js';
import { updateTicketStatus } from '../../src/repositories/tickets.js';

afterAll(async () => {
  await pool.end();
});


// ---------------------------------------------------------------------------
// GET /api/tickets/:id — entirely untested before this file
// ---------------------------------------------------------------------------

describe('GET /api/tickets/:id', () => {
  it('returns 404 with error message for an unknown id', async () => {
    const res = await request(app).get('/api/tickets/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Ticket not found' });
  });

  it('returns 200 with events as an array', async () => {
    const post = await request(app)
      .post('/api/tickets')
      .send({ subject: 'Events test', description: 'Checking events field' });
    const { ticketId } = post.body;

    const res = await request(app).get(`/api/tickets/${ticketId}`);
    expect(res.status).toBe(200);
    // events[] must always be present — not null, not missing
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  it('returns all expected top-level fields for a queued ticket', async () => {
    const post = await request(app)
      .post('/api/tickets')
      .send({ subject: 'Shape test', description: 'Checking response shape' });
    const { ticketId, referenceNumber } = post.body;

    const res = await request(app).get(`/api/tickets/${ticketId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: ticketId,
      referenceNumber,
      subject: 'Shape test',
      description: 'Checking response shape',
      status: 'queued',
    });
    expect(typeof res.body.createdAt).toBe('string');
    // processing must be absent on a queued ticket
    expect(res.body.processing).toBeUndefined();
    expect(res.body.phases).toEqual({
      triage: { status: 'pending' },
      draft: { status: 'pending' },
    });
  });

  it('derives phase status from events instead of top-level ticket status', async () => {
    const post = await request(app)
      .post('/api/tickets')
      .send({ subject: 'Event-based phases', description: 'Status and events mismatch test' });
    const { ticketId } = post.body;

    await updateTicketStatus(ticketId, 'failed');
    await insertEvent(ticketId, 'triage.started');

    const res = await request(app).get(`/api/tickets/${ticketId}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('failed');
    expect(res.body.phases).toEqual({
      triage: { status: 'processing' },
      draft: { status: 'pending' },
    });
  });

  it('keeps outputs empty when triage fails, even if stale processing data exists', async () => {
    const post = await request(app)
      .post('/api/tickets')
      .send({ subject: 'Triage failure output alignment', description: 'Failure should not expose phase outputs' });
    const { ticketId } = post.body;

    await insertProcessingResult(ticketId, {
      category: 'billing',
      priority: 'medium',
      sentiment: 'neutral',
      escalate: false,
      recommendedTeam: 'support',
      issueSummary: 'Customer asks about billing',
      customerReply: 'Thanks for contacting us.',
      internalNote: 'Review billing history',
      nextSteps: ['Investigate invoice'],
    });

    await updateTicketStatus(ticketId, 'failed');
    await insertEvent(ticketId, 'triage.started');
    await insertEvent(ticketId, 'triage.failed');

    const res = await request(app).get(`/api/tickets/${ticketId}`);
    expect(res.status).toBe(200);
    expect(res.body.phases).toEqual({
      triage: { status: 'failed' },
      draft: { status: 'pending' },
    });
  });

  it('keeps draft output empty on draft failure while preserving completed triage output', async () => {
    const post = await request(app)
      .post('/api/tickets')
      .send({ subject: 'Draft failure output alignment', description: 'Failed draft must not include output' });
    const { ticketId } = post.body;

    await insertProcessingResult(ticketId, {
      category: 'technical',
      priority: 'high',
      sentiment: 'negative',
      escalate: true,
      recommendedTeam: 'engineering',
      issueSummary: 'Service outage reported',
      customerReply: 'We are investigating the outage.',
      internalNote: 'Coordinate incident response',
      nextSteps: ['Notify on-call', 'Share status update'],
    });

    await updateTicketStatus(ticketId, 'failed');
    await insertEvent(ticketId, 'triage.started');
    await insertEvent(ticketId, 'triage.completed');
    await insertEvent(ticketId, 'draft.started');
    await insertEvent(ticketId, 'draft.failed');

    const res = await request(app).get(`/api/tickets/${ticketId}`);
    expect(res.status).toBe(200);
    expect(res.body.phases).toEqual({
      triage: {
        status: 'completed',
        output: { category: 'technical', priority: 'high' },
      },
      draft: { status: 'failed' },
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/tickets/ref/:referenceNumber
// ---------------------------------------------------------------------------

describe('GET /api/tickets/ref/:referenceNumber', () => {
  it('returns 200 with full ticket shape for a known reference number', async () => {
    const post = await request(app)
      .post('/api/tickets')
      .send({ subject: 'Ref lookup test', description: 'Testing reference lookup' });
    const { referenceNumber, ticketId } = post.body;

    const res = await request(app).get(`/api/tickets/ref/${referenceNumber}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: ticketId,
      referenceNumber,
      subject: 'Ref lookup test',
      status: 'queued',
    });
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  it('returns 404 for an unknown reference number', async () => {
    const res = await request(app).get('/api/tickets/ref/TICK-0000000000000-00000000');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Ticket not found' });
  });

  it('uses event transitions for phase status in reference lookup', async () => {
    const post = await request(app)
      .post('/api/tickets')
      .send({ subject: 'Ref event transitions', description: 'Testing phase resolver in getByRef' });
    const { referenceNumber, ticketId } = post.body;

    await updateTicketStatus(ticketId, 'failed');
    await insertEvent(ticketId, 'triage.started');
    await insertEvent(ticketId, 'triage.completed');
    await insertEvent(ticketId, 'draft.started');

    const res = await request(app).get(`/api/tickets/ref/${referenceNumber}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('failed');
    expect(res.body.phases).toEqual({
      triage: { status: 'completed' },
      draft: { status: 'processing' },
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/tickets — whitespace-only values (validation bug)
// z.string().min(1) passes "   " (3 chars ≥ 1) — should be .trim().min(1)
// These tests WILL FAIL against the current implementation
// ---------------------------------------------------------------------------

describe('POST /api/tickets — whitespace validation', () => {
  it('returns 400 with field error when subject is whitespace only', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .send({ subject: '   ', description: 'A valid description of the problem' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errors: { subject: 'Subject is required' } });
  });

  it('returns 400 with field error when description is whitespace only', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .send({ subject: 'Valid subject', description: '   ' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errors: { description: 'Description is required' } });
  });
});

// ---------------------------------------------------------------------------
// POST /api/tickets — existing tests
// ---------------------------------------------------------------------------

describe('POST /api/tickets', () => {
  it('returns 201 with the correct shape for a valid ticket', async () => {
    const res = await request(app).post('/api/tickets').send({
      subject: 'Cannot log in',
      description: 'Getting a 401 error since yesterday.',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'queued',
    });
    expect(typeof res.body.ticketId).toBe('string');
    expect(res.body.referenceNumber).toMatch(/^TICK-\d+-[0-9A-F]{8}$/);
    expect(typeof res.body.createdAt).toBe('string');
  });

  it('returns 400 naming subject when subject is missing', async () => {
    const res = await request(app).post('/api/tickets').send({
      description: 'Some description without a subject.',
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errors: { subject: 'Subject is required' } });
  });

  it('returns 400 naming description when description is missing', async () => {
    const res = await request(app).post('/api/tickets').send({
      subject: 'A subject without a description',
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errors: { description: 'Description is required' } });
  });

  it('returns 400 naming subject when subject is an empty string', async () => {
    const res = await request(app).post('/api/tickets').send({
      subject: '',
      description: 'A valid description of the problem',
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errors: { subject: 'Subject is required' } });
  });

  it('names both missing fields when neither is provided', async () => {
    const res = await request(app).post('/api/tickets').send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: {
        subject: 'Subject is required',
        description: 'Description is required',
      },
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/tickets — length limits (subject 3–120, description 20–5000, after trim)
// ---------------------------------------------------------------------------

describe('POST /api/tickets — length limits', () => {
  const validSubject = 'Cannot export CSV';
  const validDescription = 'The export button spins and then nothing downloads.';

  it.each([
    ['subject', 'ab', validDescription, 'Subject needs at least 3 characters.'],
    ['subject', 'a'.repeat(121), validDescription, 'Subject can be at most 120 characters.'],
    ['description', validSubject, 'x'.repeat(19), 'Description needs at least 20 characters.'],
    ['description', validSubject, 'x'.repeat(5001), 'Description can be at most 5000 characters.'],
  ])('rejects a %s outside the limits with a 400 naming the field', async (field, subject, description, message) => {
    const res = await request(app).post('/api/tickets').send({ subject, description });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errors: { [field]: message } });
  });

  it('counts length after trimming surrounding whitespace', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .send({ subject: '  ab  ', description: `   ${'x'.repeat(19)}   ` });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: {
        subject: 'Subject needs at least 3 characters.',
        description: 'Description needs at least 20 characters.',
      },
    });
  });

  it('accepts values exactly at the minimum lengths', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .send({ subject: 'abc', description: 'x'.repeat(20) });
    expect(res.status).toBe(201);
  });

  it('accepts values exactly at the maximum lengths', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .send({ subject: 'a'.repeat(120), description: 'x'.repeat(5000) });
    expect(res.status).toBe(201);
  });
});
