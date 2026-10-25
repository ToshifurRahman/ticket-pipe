import { describe, expect, it, vi } from 'vitest';

import { createBrevoMailer } from '../src/lib/mailer.js';

describe('brevo driver', () => {
  const message = { to: 'who@example.test', subject: 'Hi', text: 'text', html: '<p>html</p>' };

  it('posts the message to the Brevo API with the key and sender', async () => {
    process.env.BREVO_API_KEY = 'key-123';
    process.env.MAIL_FROM = 'relay@example.test';
    process.env.MAIL_FROM_NAME = 'Relay';
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 201 })));
    await createBrevoMailer(fetchMock as unknown as typeof fetch).send(message);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init.headers as Record<string, string>)['api-key']).toBe('key-123');
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { email: 'relay@example.test', name: 'Relay' },
      to: [{ email: 'who@example.test' }],
      subject: 'Hi',
      textContent: 'text',
      htmlContent: '<p>html</p>',
    });
  });

  it('throws a status-only error that does not echo the response body', async () => {
    process.env.BREVO_API_KEY = 'key-123';
    process.env.MAIL_FROM = 'relay@example.test';
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response('bad recipient who@example.test', { status: 400 }))
    );
    await expect(
      createBrevoMailer(fetchMock as unknown as typeof fetch).send(message)
    ).rejects.toThrow(new Error('Brevo responded 400'));
  });
});
