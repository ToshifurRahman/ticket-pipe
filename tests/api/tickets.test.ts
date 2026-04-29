import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index.js';
import { pool } from '../../src/lib/db.js';

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
      status: 'queued',
    });
    expect(typeof res.body.createdAt).toBe('string');
    // processing must be absent on a queued ticket
    expect(res.body.processing).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// POST /api/tickets — whitespace-only values (validation bug)
// z.string().min(1) passes "   " (3 chars ≥ 1) — should be .trim().min(1)
// These tests WILL FAIL against the current implementation
// ---------------------------------------------------------------------------

describe('POST /api/tickets — whitespace validation', () => {
  it('returns 400 when subject is whitespace only', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .send({ subject: '   ', description: 'Valid description' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid request body' });
  });

  it('returns 400 when description is whitespace only', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .send({ subject: 'Valid subject', description: '   ' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid request body' });
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

  it('returns 400 when subject is missing', async () => {
    const res = await request(app).post('/api/tickets').send({
      description: 'Some description without a subject.',
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid request body' });
  });

  it('returns 400 when description is missing', async () => {
    const res = await request(app).post('/api/tickets').send({
      subject: 'A subject without a description',
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid request body' });
  });

  it('returns 400 when subject is an empty string', async () => {
    const res = await request(app).post('/api/tickets').send({
      subject: '',
      description: 'Valid description',
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid request body' });
  });
});
