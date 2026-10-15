import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/lib/query-client';
import type { NotificationView } from '@/lib/types';
import { server } from '@/test/server';
import { TICKET_ID } from '@/test/ticket-fixtures';
import { NotifyCard } from './notify-card';

vi.mock('@/components/turnstile', () => ({
  Turnstile: ({ onToken }: { onToken: (token: string | null) => void }) => {
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
      return HttpResponse.json({ available: true, state: 'pending', maskedEmail: 't•••@example.test' }, { status: 201 });
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
    ['confirmed', /We’ll email/],
    ['sent', /We emailed/],
  ] as const)('shows the %s state', async (state, text) => {
    renderCard({ available: true, state, maskedEmail: 't•••@example.test' });
    expect(await screen.findByRole('status')).toHaveTextContent(text);
  });
});
