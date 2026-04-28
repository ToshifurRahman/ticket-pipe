import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index.js';
import { pool } from '../../src/lib/db.js';

afterAll(async () => {
  await pool.end();
});

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
