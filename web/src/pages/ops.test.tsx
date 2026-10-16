import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { OpsHeaderActions } from '@/components/ops/ops-header-actions';
import { createQueryClient } from '@/lib/query-client';
import type { OpsSession } from '@/lib/types';
import { createFakeSocket } from '@/test/fake-socket';
import { aiCall, events, listedTicket, OPS_ID, opsTicket, OTHER_ID, summary, ticketList } from '@/test/ops-fixtures';
import { server } from '@/test/server';
import { OpsPage } from './ops';

const fakeSocket = vi.hoisted(() => ({ current: null as ReturnType<typeof createFakeSocket> | null }));
vi.mock('@/lib/socket', () => ({ getSocket: () => fakeSocket.current }));
const socket = () => fakeSocket.current!;

// What the API answers right now; tests change these and play the socket event.
let session: OpsSession;
let listRequests: URLSearchParams[];
let list = ticketList([listedTicket()]);

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="url">{pathname + search}</output>;
}

function renderConsole(path = '/ops') {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <OpsHeaderActions />
        <Routes>
          <Route path="/ops" element={<OpsPage />} />
        </Routes>
        <Where />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// The feed subscribes on connect and the server answers through the ack callback.
async function acknowledge(ok = true) {
  await waitFor(() => expect(socket().emit).toHaveBeenCalledWith('ops:subscribe', expect.any(Function)));
  const ack = socket().emit.mock.calls.find((c) => c[0] === 'ops:subscribe')![1] as (r: { ok: boolean }) => void;
  await act(async () => ack({ ok }));
}

afterEach(() => void toast.dismiss());

beforeEach(() => {
  fakeSocket.current = createFakeSocket();
  session = { signedIn: true, expiresAt: '2099-01-01T00:00:00.000Z' };
  list = ticketList([listedTicket()]);
  listRequests = [];
  server.use(
    http.get('/api/ops/session', () => HttpResponse.json(session)),
    http.get('/api/tickets', ({ request }) => {
      listRequests.push(new URL(request.url).searchParams);
      return HttpResponse.json(list);
    }),
    http.get('/api/ops/ai-interactions/summary', () => HttpResponse.json(summary())),
    http.get('/api/ops/tickets/:id', () => HttpResponse.json(opsTicket())),
    http.get('/api/ops/tickets/:id/events', () =>
      HttpResponse.json({ events: events('ticket.received', 'triage.completed'), nextCursor: null })
    ),
    http.get('/api/ops/ai-interactions', () => HttpResponse.json({ interactions: [aiCall('a1')] }))
  );
});

describe('signed out', () => {
  beforeEach(() => {
    session = { signedIn: false };
  });

  it('shows only the sign-in card, and asks for nothing else', async () => {
    const tickets = vi.fn();
    server.use(http.get('/api/tickets', () => (tickets(), HttpResponse.json(list))));
    renderConsole();

    expect(await screen.findByLabelText('Ops token')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
    expect(tickets).not.toHaveBeenCalled();
    expect(socket().connect).not.toHaveBeenCalled();
  });

  it('says so when the token is wrong, and clears the message as you type', async () => {
    const user = userEvent.setup();
    server.use(http.post('/api/ops/session', () => HttpResponse.json({ error: 'Invalid token' }, { status: 401 })));
    renderConsole();

    await user.type(await screen.findByLabelText('Ops token'), 'nope{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent("That token didn't work.");

    await user.type(screen.getByLabelText('Ops token'), 'x');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [429, 'Too many attempts'],
    [503, "isn't set up"],
  ])('explains a %i', async (status, text) => {
    const user = userEvent.setup();
    server.use(http.post('/api/ops/session', () => HttpResponse.json({ error: 'x' }, { status })));
    renderConsole();
    await user.type(await screen.findByLabelText('Ops token'), 'abc{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it('opens the console after a right token', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/ops/session', async ({ request }) => {
        expect(await request.json()).toEqual({ token: 'good-token' });
        session = { signedIn: true, expiresAt: '2099-01-01T00:00:00.000Z' };
        return HttpResponse.json(session);
      })
    );
    renderConsole();

    await user.type(await screen.findByLabelText('Ops token'), 'good-token{Enter}');

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('keeps the sign-in button off until something is typed', async () => {
    renderConsole();
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeDisabled();
  });
});

describe('the ticket table', () => {
  it('lists tickets with their triage, status and the KPIs and tab counts', async () => {
    list = ticketList([
      listedTicket(),
      listedTicket({ id: OTHER_ID, referenceNumber: 'TICK-1759993412345-FFFFFFFF', subject: 'CSV export never starts', status: 'processing', category: null, priority: null }),
    ]);
    renderConsole();

    const table = await screen.findByRole('table');
    await screen.findByText('CSV export never starts');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('TICK-1759993412345-A1B2C3D4');
    expect(rows[0]).toHaveTextContent('Account access');
    expect(rows[0]).toHaveTextContent('High');
    expect(rows[0]).toHaveTextContent('Needs attention');
    // Not triaged yet: dashes, and the real status rather than "With our team".
    expect(rows[1]).toHaveTextContent('Processing');
    expect(rows[1].textContent?.match(/Not yet/g)).toHaveLength(2);

    const kpis = within(await screen.findByLabelText('Last 24 hours'));
    expect(await kpis.findByText('142')).toBeInTheDocument();
    expect(kpis.getByText('96.5%')).toBeInTheDocument();
    expect(kpis.getByText('2.1 s')).toBeInTheDocument();
    expect(kpis.getByText('0.0%')).toBeInTheDocument();

    const tabs = screen.getByRole('tablist');
    expect(within(tabs).getByRole('tab', { name: /All/ })).toHaveTextContent('142');
    expect(within(tabs).getByRole('tab', { name: /Needs attention/ })).toHaveTextContent('3');
    expect(within(tabs).getByRole('tab', { name: /Failed/ })).toHaveTextContent('2');
    expect(within(tabs).getByRole('tab', { name: /Completed/ })).toHaveTextContent('137');
  });

  it('asks for the newest update first, 20 at a time', async () => {
    renderConsole();
    await screen.findByRole('table');
    expect(Object.fromEntries(listRequests.at(-1)!)).toEqual({ page: '1', limit: '20', sort: 'updatedAt', order: 'desc' });
  });

  it('filters by a status tab and keeps it in the URL', async () => {
    const user = userEvent.setup();
    renderConsole();
    await screen.findByRole('table');

    await user.click(screen.getByRole('tab', { name: /Failed/ }));

    await waitFor(() => expect(listRequests.at(-1)!.get('status')).toBe('failed'));
    expect(screen.getByRole('tab', { name: /Failed/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('url')).toHaveTextContent('/ops?status=failed');
  });

  it('restores the view from the URL', async () => {
    renderConsole('/ops?status=completed&page=2&sort=createdAt&order=asc');
    await screen.findByRole('table');
    expect(Object.fromEntries(listRequests.at(-1)!)).toEqual({
      page: '2', limit: '20', sort: 'createdAt', order: 'asc', status: 'completed',
    });
    expect(screen.getByRole('tab', { name: /Completed/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('sorts: a header toggles the direction, a new column starts newest first', async () => {
    const user = userEvent.setup();
    renderConsole();
    await screen.findByRole('table');
    const updated = screen.getByRole('columnheader', { name: /Updated/ });
    expect(updated).toHaveAttribute('aria-sort', 'descending');

    await user.click(within(updated).getByRole('button'));
    await waitFor(() => expect(listRequests.at(-1)!.get('order')).toBe('asc'));
    expect(screen.getByRole('columnheader', { name: /Updated/ })).toHaveAttribute('aria-sort', 'ascending');

    await user.click(within(screen.getByRole('columnheader', { name: /Created/ })).getByRole('button'));
    await waitFor(() => expect(listRequests.at(-1)!.get('sort')).toBe('createdAt'));
    expect(listRequests.at(-1)!.get('order')).toBe('desc');
  });

  it('pages, and shows where you are', async () => {
    const user = userEvent.setup();
    list = { ...ticketList([listedTicket()], undefined, 45), page: 1 };
    renderConsole();

    expect(await screen.findByText('1 to 20 of 45')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    list = { ...list, page: 2 };
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(listRequests.at(-1)!.get('page')).toBe('2'));
    expect(await screen.findByText('21 to 40 of 45')).toBeInTheDocument();
  });

  it('says when a tab is empty', async () => {
    list = ticketList([], { completed: 3 }, 0);
    renderConsole();
    expect(await screen.findByText('No tickets here.')).toBeInTheDocument();
  });

  it('offers a retry when the list cannot load', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/tickets', () => HttpResponse.json({ error: 'boom' }, { status: 500 })));
    renderConsole();
    const retry = await screen.findByRole('button', { name: 'Try again' }, { timeout: 5000 });

    server.use(http.get('/api/tickets', () => HttpResponse.json(list)));
    await user.click(retry);
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});

describe('live updates', () => {
  it('subscribes once connected and shows the feed as live', async () => {
    renderConsole();
    await screen.findByRole('table');
    await acknowledge();
    expect(await screen.findByText('Live feed connected')).toBeInTheDocument();
  });

  it('reads the list again when the feed reports ticket activity, in one burst', async () => {
    renderConsole();
    await screen.findByRole('table');
    await acknowledge();
    await waitFor(() => expect(listRequests.length).toBeGreaterThanOrEqual(1));
    await new Promise((r) => setTimeout(r, 450)); // the post-subscribe refresh
    const before = listRequests.length;

    list = ticketList([listedTicket({ status: 'completed', subject: 'Now resolved' })]);
    await act(async () => {
      for (let i = 0; i < 5; i++) socket().serverEmit('ops:ticket_event', { ticketId: OPS_ID, event: 'x' });
    });

    expect(await screen.findByText('Now resolved')).toBeInTheDocument();
    expect(listRequests.length).toBe(before + 1);
  });

  it.each(['ticket:requeued', 'ticket:failed', 'ticket:needs_attention'])('also reacts to %s', async (event) => {
    renderConsole();
    await screen.findByRole('table');
    await acknowledge();
    await new Promise((r) => setTimeout(r, 450));
    const before = listRequests.length;

    await act(async () => socket().serverEmit(event, { ticketId: OPS_ID, referenceNumber: 'TICK-X', reason: 'x', previousStatus: 'failed' }));

    await waitFor(() => expect(listRequests.length).toBeGreaterThan(before));
  });

  it('returns to the sign-in card when the server refuses the subscription', async () => {
    renderConsole();
    await screen.findByRole('table');
    await acknowledge(false);
    expect(await screen.findByLabelText('Ops token')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('returns to the sign-in card when the session is revoked, and stops listening', async () => {
    renderConsole();
    await screen.findByRole('table');
    await acknowledge();

    await act(async () => socket().serverEmit('ops:revoked'));

    expect(await screen.findByLabelText('Ops token')).toBeInTheDocument();
    expect(socket().disconnect).toHaveBeenCalled();
  });

  it('returns to the sign-in card on a 401 from any console request', async () => {
    server.use(http.get('/api/tickets', () => HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })));
    renderConsole();
    expect(await screen.findByLabelText('Ops token')).toBeInTheDocument();
  });

  it('shows the feed as offline when the socket drops', async () => {
    renderConsole();
    await screen.findByRole('table');
    await acknowledge();
    await act(async () => socket().serverEmit('disconnect'));
    expect(await screen.findByText('Feed offline')).toBeInTheDocument();
  });
});

describe('signing out', () => {
  it('ends the session and shows the sign-in card', async () => {
    const user = userEvent.setup();
    const signedOut = vi.fn();
    server.use(
      http.delete('/api/ops/session', () => {
        signedOut();
        return new HttpResponse(null, { status: 204 });
      })
    );
    renderConsole();

    await user.click(await screen.findByRole('button', { name: /sign out/i }));

    expect(await screen.findByLabelText('Ops token')).toBeInTheDocument();
    expect(signedOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('alert toasts', () => {
  it('announces a ticket that needs attention, and Open shows it', async () => {
    const user = userEvent.setup();
    renderConsole();
    await screen.findByRole('table');
    await acknowledge();

    await act(async () =>
      socket().serverEmit('ticket:needs_attention', {
        ticketId: OPS_ID,
        referenceNumber: 'TICK-1759993412345-A1B2C3D4',
        reason: 'incomplete_output',
        occurredAt: '2026-10-12T14:02:21.000Z',
      })
    );

    // Sonner's store is global, so earlier tests' toasts can still be on screen: find this one.
    const message = await screen.findByText(/TICK-1759993412345-A1B2C3D4 needs attention: Incomplete output/);
    await user.click(within(message.closest('li')!).getByRole('button', { name: /^Open$/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent(`ticket=${OPS_ID}`);
  });

  it('announces a failed ticket with its reason', async () => {
    renderConsole();
    await screen.findByRole('table');
    await acknowledge();
    await act(async () =>
      socket().serverEmit('ticket:failed', { ticketId: OPS_ID, referenceNumber: 'TICK-F', reason: 'draft_retries_exhausted' })
    );
    expect(await screen.findByText(/TICK-F failed: Draft retries exhausted/)).toBeInTheDocument();
  });
});
