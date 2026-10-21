import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ON_HOLD_MESSAGE } from '@/components/ticket/ticket-thread';
import { createQueryClient } from '@/lib/query-client';
import type { TicketDetail } from '@/lib/types';
import { createFakeSocket } from '@/test/fake-socket';
import { server } from '@/test/server';
import { TICKET_ID, TICKET_REF, ticketAt } from '@/test/ticket-fixtures';
import { TicketPage } from './ticket';

const fakeSocket = vi.hoisted(() => ({ current: null as ReturnType<typeof createFakeSocket> | null }));
vi.mock('@/lib/socket', () => ({ getSocket: () => fakeSocket.current }));
const socket = () => fakeSocket.current!;

// What the API answers right now. Tests move the ticket along by replacing it, then play
// the socket event that tells the page to look again.
let current: TicketDetail;
let lookups: number;

beforeEach(() => {
  fakeSocket.current = createFakeSocket();
  lookups = 0;
  server.use(
    http.get('/api/tickets/:id/notification', () => HttpResponse.json({ available: false, state: 'none' })),
    http.get('/api/tickets/ref/:ref', () => {
      lookups++;
      return HttpResponse.json(current);
    })
  );
});

function renderAt(ref: string = TICKET_REF) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/t/${ref}`]}>
        <Routes>
          <Route path="/t/:ref" element={<TicketPage />} />
          <Route path="/new" element={<p>New ticket page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function advance(next: TicketDetail, event: string) {
  current = next;
  await act(async () => socket().serverEmit('ticket:update', { event, ticketId: TICKET_ID }));
}

const indicator = () => screen.findByRole('status');

describe('ticket page: live thread', () => {
  it('follows a ticket from queued to the reply without reloading', async () => {
    current = ticketAt('queued');
    renderAt();

    const article = (await screen.findByRole('heading', { name: 'Charged twice in March' })).closest('article')!;
    expect(screen.getByText('My card was charged twice for the March invoice.')).toBeInTheDocument();
    expect(await indicator()).toHaveTextContent('Reading your request...');
    expect(screen.queryByText('Billing')).not.toBeInTheDocument();

    // It joins its ticket's room once connected.
    expect(socket().emit).toHaveBeenCalledWith('join', TICKET_ID);

    await advance(ticketAt('reviewing'), 'triage.started');
    expect(await indicator()).toHaveTextContent('Reading your request...');

    // Badges show as soon as triage finishes, before the reply.
    await advance(ticketAt('writing'), 'triage.completed');
    expect(await screen.findByText('Writing a reply...')).toBeInTheDocument();
    const badges = screen.getByRole('list', { name: 'Triage' });
    expect(within(badges).getByText('Billing')).toBeInTheDocument();
    expect(within(badges).getByText('High priority')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Drafting');

    await advance(ticketAt('replied'), 'ticket.completed');
    expect(await screen.findByText('We refunded the duplicate charge.')).toBeInTheDocument();
    expect(screen.getByText(/^Reply from support/)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Progress' })).getByText('Replied')).toBeInTheDocument();
    expect(screen.getByText(/This conversation is closed/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open a new ticket/ })).toHaveAttribute('href', '/new');

    // The same page throughout, and a completed ticket stops listening.
    expect(screen.getByRole('heading', { name: 'Charged twice in March' }).closest('article')).toBe(article);
    expect(socket().disconnect).toHaveBeenCalled();
  });

  it.each(['failed', 'needs_attention'] as const)(
    'puts %s on hold with one neutral message, stays connected, and resumes on a replay',
    async (stage) => {
      current = ticketAt(stage);
      renderAt();

      expect(await screen.findByText(ON_HOLD_MESSAGE)).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      // Nothing is live; the last ply reads On hold, as the demo draws it.
      expect(screen.queryByRole('listitem', { current: 'step' })).not.toBeInTheDocument();
      const progress = screen.getByRole('list', { name: 'Progress' });
      expect(within(progress).getByText(/On hold/)).toHaveTextContent(/on hold/i);
      expect(screen.queryByText(/notified/)).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Office use' })).toBeInTheDocument();
      expect(screen.queryByText(/closed/)).not.toBeInTheDocument();
      expect(socket().disconnect).not.toHaveBeenCalled();

      await advance(ticketAt('writing', { status: 'queued' }), 'ticket.requeued');
      expect(await screen.findByText('Writing a reply...')).toBeInTheDocument();
      expect(screen.queryByText(ON_HOLD_MESSAGE)).not.toBeInTheDocument();

      await advance(ticketAt('replied'), 'ticket.completed');
      expect(await screen.findByText('We refunded the duplicate charge.')).toBeInTheDocument();
    }
  );

  it('rejoins its room and reads the ticket again after a reconnect', async () => {
    current = ticketAt('reviewing');
    renderAt();
    await indicator();
    const before = lookups;

    current = ticketAt('writing');
    await act(async () => socket().serverEmit('connect'));

    expect(socket().emit).toHaveBeenLastCalledWith('join', TICKET_ID);
    expect(await screen.findByText('Writing a reply...')).toBeInTheDocument();
    expect(lookups).toBeGreaterThan(before);
  });

  it('does not open a socket for a ticket that is already answered', async () => {
    current = ticketAt('replied');
    renderAt();
    await screen.findByText('We refunded the duplicate charge.');
    expect(socket().connect).not.toHaveBeenCalled();
  });
});

describe('ticket page: other states', () => {
  it('shows a skeleton while loading', async () => {
    current = ticketAt('queued');
    renderAt();
    expect(screen.getByLabelText('Loading ticket')).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Charged twice in March' });
  });

  it('shows a friendly not-found state with the track field for an unknown ref', async () => {
    server.use(http.get('/api/tickets/ref/:ref', () => HttpResponse.json({ error: 'Ticket not found' }, { status: 404 })));
    renderAt();
    expect(await screen.findByRole('heading', { name: "We couldn't find that ticket" })).toBeInTheDocument();
    expect(screen.getByText(/Not on file/)).toBeInTheDocument();
    expect(screen.getByLabelText('Ticket reference')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open a new ticket' })).toHaveAttribute('href', '/new');
  });

  it('shows not-found for a malformed ref without asking the API', () => {
    renderAt('not-a-ref');
    expect(screen.getByRole('heading', { name: "We couldn't find that ticket" })).toBeInTheDocument();
    expect(lookups).toBe(0);
  });

  it('accepts a lowercase ref and shows the canonical one', async () => {
    current = ticketAt('queued');
    renderAt(TICKET_REF.toLowerCase());
    expect(await screen.findByTestId('ticket-reference')).toHaveTextContent(TICKET_REF);
  });

  it('offers a retry when the ticket cannot be loaded', async () => {
    let fail = true;
    server.use(
      http.get('/api/tickets/ref/:ref', () =>
        fail ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json(ticketAt('queued'))
      )
    );
    renderAt();

    const retry = await screen.findByRole('button', { name: /Try again/ }, { timeout: 5000 });
    expect(screen.getByRole('heading', { name: "We couldn't load this ticket right now" })).toBeInTheDocument();

    fail = false;
    await act(async () => retry.click());
    expect(await screen.findByRole('heading', { name: 'Charged twice in March' })).toBeInTheDocument();
  });
});
