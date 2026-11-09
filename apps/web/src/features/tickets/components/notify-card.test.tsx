import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { type Ref, useEffect, useImperativeHandle } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { TurnstileHandle } from '@/components/turnstile';
import { createQueryClient } from '@/lib/query-client';
import { server } from '@/test/server';

import { TICKET_ID } from '../testing';
import type { NotificationView } from '../types';
import { NotifyCard } from './notify-card';

const turnstile = vi.hoisted(() => ({ resets: 0 }));

vi.mock('@/components/turnstile', () => ({
  Turnstile: ({
    onToken,
    ref,
  }: {
    onToken: (token: string | null) => void;
    ref?: Ref<TurnstileHandle>;
  }) => {
    useImperativeHandle(ref, () => ({
      reset() {
        turnstile.resets++;
      },
    }));
    useEffect(() => onToken('token-1'), [onToken]);
    return null;
  },
}));

function renderCard(initial: NotificationView) {
  const posted: unknown[] = [];
  server.use(
    http.get(`/api/tickets/${TICKET_ID}/notification`, () => HttpResponse.json(initial)),
    http.post(`/api/tickets/${TICKET_ID}/notification`, async ({ request }) => {
      posted.push(await request.json());
      return HttpResponse.json(
        { available: true, state: 'pending', maskedEmail: 't•••@example.test' },
        { status: 201 }
      );
    })
  );
  render(
    <QueryClientProvider client={createQueryClient()}>
      <NotifyCard ticketId={TICKET_ID} />
    </QueryClientProvider>
  );
  return posted;
}

describe('notify card', () => {
  it('renders nothing when email is not available', async () => {
    let asked = false;
    server.use(
      http.get(`/api/tickets/${TICKET_ID}/notification`, () => {
        asked = true;
        return HttpResponse.json({ available: false, state: 'none' });
      })
    );
    const { container } = render(
      <QueryClientProvider client={createQueryClient()}>
        <NotifyCard ticketId={TICKET_ID} />
      </QueryClientProvider>
    );
    await vi.waitFor(() => expect(asked).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });

  it('asks for the address, then tells the customer to check their inbox', async () => {
    const posted = renderCard({ available: true, state: 'none' });
    await userEvent.type(await screen.findByLabelText('Email address'), 'taylor@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Notify me' }));

    expect(await screen.findByText('Check your inbox')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('t•••@example.test');
    expect(posted).toEqual([{ email: 'taylor@example.test', turnstileToken: 'token-1' }]);
  });

  it('rejects an obviously wrong address without calling the API', async () => {
    const posted = renderCard({ available: true, state: 'none' });
    await userEvent.type(await screen.findByLabelText('Email address'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Notify me' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(posted).toEqual([]);
  });

  it.each([
    ['confirmed', /We'll email/],
    ['sent', /We emailed/],
  ] as const)('shows the %s state', async (state, text) => {
    renderCard({ available: true, state, maskedEmail: 't•••@example.test' });
    expect(await screen.findByRole('status')).toHaveTextContent(text);
  });

  it.each([
    [403, "We couldn't verify your request. Please try again.", 'Server refused.'],
    [429, "You've sent several tickets recently. Please try again in about an hour.", 'Slow down.'],
    [503, "We can't accept new requests right now. Please try again shortly.", 'Try soon.'],
  ])('shows the API message for %s and resets the widget', async (status, _fallback, message) => {
    turnstile.resets = 0;
    server.use(
      http.get(`/api/tickets/${TICKET_ID}/notification`, () =>
        HttpResponse.json({ available: true, state: 'none' })
      ),
      http.post(`/api/tickets/${TICKET_ID}/notification`, () =>
        HttpResponse.json({ error: message }, { status })
      )
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <NotifyCard ticketId={TICKET_ID} />
      </QueryClientProvider>
    );
    await userEvent.type(await screen.findByLabelText('Email address'), 'taylor@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Notify me' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(turnstile.resets).toBe(1);
  });

  it.each([
    [403, "We couldn't verify your request. Please try again."],
    [429, "You've sent several tickets recently. Please try again in about an hour."],
    [503, "We can't accept new requests right now. Please try again shortly."],
  ])('falls back to friendly copy for %s when the API sends none', async (status, fallback) => {
    turnstile.resets = 0;
    server.use(
      http.get(`/api/tickets/${TICKET_ID}/notification`, () =>
        HttpResponse.json({ available: true, state: 'none' })
      ),
      http.post(`/api/tickets/${TICKET_ID}/notification`, () => HttpResponse.json({}, { status }))
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <NotifyCard ticketId={TICKET_ID} />
      </QueryClientProvider>
    );
    await userEvent.type(await screen.findByLabelText('Email address'), 'taylor@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Notify me' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(fallback);
    expect(turnstile.resets).toBe(1);
  });
});
