import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ApiError, request } from './api';
import { server } from '@/test/server';

describe('request', () => {
  it('returns the parsed JSON body', async () => {
    server.use(http.get('/api/thing', () => HttpResponse.json({ ok: true })));
    await expect(request<{ ok: boolean }>('/api/thing')).resolves.toEqual({ ok: true });
  });

  it('sends a JSON content type with a body', async () => {
    let contentType: string | null = null;
    server.use(
      http.post('/api/thing', ({ request: req }) => {
        contentType = req.headers.get('content-type');
        return HttpResponse.json({}, { status: 201 });
      })
    );
    await request('/api/thing', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    expect(contentType).toBe('application/json');
  });

  it('throws ApiError carrying field errors from a 400', async () => {
    server.use(http.post('/api/tickets', () => HttpResponse.json({ errors: { subject: 'Too short' } }, { status: 400 })));
    const error = await request('/api/tickets', { method: 'POST', body: '{}' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).fieldErrors).toEqual({ subject: 'Too short' });
  });

  it('uses the API error message on a 404 and has no field errors', async () => {
    server.use(http.get('/api/missing', () => HttpResponse.json({ error: 'Ticket not found' }, { status: 404 })));
    const error = (await request('/api/missing').catch((e: unknown) => e)) as ApiError;
    expect(error.message).toBe('Ticket not found');
    expect(error.fieldErrors).toBeNull();
  });

  it('copes with a non-JSON 500', async () => {
    server.use(http.get('/api/boom', () => new HttpResponse('upstream exploded', { status: 500 })));
    const error = (await request('/api/boom').catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(500);
    expect(error.body).toBe('upstream exploded');
  });
});
