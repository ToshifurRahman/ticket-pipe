import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { aiCall, events, OPS_ID, opsTicket } from '@/test/ops-fixtures';
import { server } from '@/test/server';
import type { TicketStatus } from '@/lib/types';
import { TicketDrawer } from './ticket-drawer';

// No retries: a failing request should show its error state at once.
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderDrawer(onClose = vi.fn()) {
  render(
    <QueryClientProvider client={client()}>
      <TicketDrawer ticketId={OPS_ID} onClose={onClose} />
      <Toaster />
    </QueryClientProvider>
  );
  return onClose;
}

function serve(status: TicketStatus, overrides: Parameters<typeof opsTicket>[1] = {}) {
  server.use(
    http.get('/api/ops/tickets/:id', () => HttpResponse.json(opsTicket(status, overrides))),
    http.get('/api/ops/tickets/:id/events', () =>
      HttpResponse.json({ events: events('ticket.received', 'triage.completed'), nextCursor: null })
    ),
    http.get('/api/ops/ai-interactions', () => HttpResponse.json({ interactions: [aiCall('a1')] }))
  );
}

afterEach(() => void toast.dismiss());

describe('the ticket drawer', () => {
  it('shows the full triage, the customer message and what the AI drafted', async () => {
    serve('completed');
    renderDrawer();

    const drawer = await screen.findByRole('dialog');
    expect(
      await within(drawer).findByRole('heading', { name: 'Account locked after password reset' })
    ).toBeInTheDocument();
    expect(within(drawer).getByText('TICK-1759993412345-A1B2C3D4')).toBeInTheDocument();

    const triage = within(drawer).getByText('Category').closest('dl')!;
    expect(triage).toHaveTextContent('Account access');
    expect(triage).toHaveTextContent('High');
    expect(triage).toHaveTextContent('Frustrated');
    expect(triage).toHaveTextContent('Yes');
    expect(triage).toHaveTextContent('Identity and access');
    expect(drawer).toHaveTextContent('User reset their password and now sees "account locked".');

    expect(drawer).toHaveTextContent(
      'I reset my password and now every login says my account is locked.'
    );
    expect(drawer).toHaveTextContent('We have unlocked your account.');
    expect(drawer).toHaveTextContent('Lockout counter was not reset by the reset flow.');
    expect(drawer).toHaveTextContent('Confirm login works');
    expect(drawer).toHaveTextContent('File a bug for the reset flow');
  });

  it('says what is missing for a ticket that has not got that far', async () => {
    serve('needs_attention', {
      phases: { triage: { status: 'pending' }, draft: { status: 'pending' } },
    });
    renderDrawer();
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText('No triage result yet.')).toBeInTheDocument();
    expect(within(drawer).getByText('No draft yet.')).toBeInTheDocument();
  });

  it('groups repeated timeline events and keeps the detail behind a toggle', async () => {
    serve('needs_attention');
    server.use(
      http.get('/api/ops/tickets/:id/events', () =>
        HttpResponse.json({
          events: events(
            'ticket.received',
            'triage.completed',
            ['draft.invalid', 'missing nextActions'],
            ['draft.invalid', 'missing nextActions'],
            ['draft.invalid', 'missing nextActions'],
            'ticket.needs_attention'
          ),
          nextCursor: null,
        })
      )
    );
    const user = userEvent.setup();
    renderDrawer();

    const timeline = (await screen.findByRole('heading', { name: 'Event timeline' }))
      .parentElement!;
    const items = await within(timeline).findAllByRole('listitem');
    expect(items.map((i) => i.firstElementChild!.textContent!.replace(/\s+/g, ' ').trim())).toEqual(
      ['ticket.received', 'triage.completed', 'draft.invalid ×3', 'ticket.needs_attention']
    );

    const toggle = within(timeline).getByText('details');
    expect(toggle.closest('details')!.open).toBe(false);
    await user.click(toggle);
    expect(toggle.closest('details')!.open).toBe(true);
    expect(timeline).toHaveTextContent('missing nextActions');
  });

  it('loads further timeline pages on request', async () => {
    serve('failed');
    const afters: (string | null)[] = [];
    server.use(
      http.get('/api/ops/tickets/:id/events', ({ request }) => {
        const after = new URL(request.url).searchParams.get('after');
        afters.push(after);
        return after
          ? HttpResponse.json({ events: events('ticket.failed'), nextCursor: null })
          : HttpResponse.json({ events: events('ticket.received'), nextCursor: 'cursor-1' });
      })
    );
    const user = userEvent.setup();
    renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('ticket.failed')).toBeInTheDocument();
    expect(screen.getByText('ticket.received')).toBeInTheDocument();
    expect(afters).toEqual([null, 'cursor-1']);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('lists the AI calls oldest first, marking a fallback call and a failed outcome', async () => {
    serve('failed');
    server.use(
      http.get('/api/ops/ai-interactions', ({ request }) => {
        expect(new URL(request.url).searchParams.get('ticketId')).toBe(OPS_ID);
        return HttpResponse.json({
          interactions: [
            aiCall('3', {
              operation: 'draft',
              provider: 'backup',
              model: 'openai/gpt-oss-20b',
              outcome: 'invalid_response',
              durationMs: 3700,
              createdAt: '2026-10-12T14:02:20.000Z',
            }),
            aiCall('2', {
              operation: 'draft',
              provider: 'primary',
              outcome: 'invalid_response',
              durationMs: 4200,
              createdAt: '2026-10-12T14:02:15.000Z',
            }),
            aiCall('1', {
              operation: 'triage',
              durationMs: 1900,
              createdAt: '2026-10-12T14:02:08.000Z',
            }),
          ],
        });
      })
    );
    renderDrawer();

    const heading = await screen.findByRole('heading', { name: 'AI calls' });
    const rows = (await within(heading.parentElement!).findAllByRole('row')).slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      'triagegemini-3.8-flash1.9sok',
      'draftgemini-3.8-flash4.2sInvalid response',
      'draftopenai/gpt-oss-20bfallback3.7sInvalid response',
    ]);
  });

  it('says so when no AI calls were recorded', async () => {
    serve('failed');
    server.use(http.get('/api/ops/ai-interactions', () => HttpResponse.json({ interactions: [] })));
    renderDrawer();
    expect(await screen.findByText('No AI calls recorded.')).toBeInTheDocument();
  });

  it('shows a not-found state for an unknown ticket', async () => {
    server.use(
      http.get('/api/ops/tickets/:id', () =>
        HttpResponse.json({ error: 'Ticket not found' }, { status: 404 })
      )
    );
    renderDrawer();
    expect(await screen.findByRole('heading', { name: 'Ticket not found' })).toBeInTheDocument();
  });

  it('offers a retry when the ticket cannot load', async () => {
    server.use(
      http.get('/api/ops/tickets/:id', () => HttpResponse.json({ error: 'boom' }, { status: 500 }))
    );
    const user = userEvent.setup();
    renderDrawer();
    const retry = await screen.findByRole('button', { name: 'Try again' });

    serve('completed');
    await user.click(retry);
    expect(
      await screen.findByRole('heading', { name: 'Account locked after password reset' })
    ).toBeInTheDocument();
  });

  it('closes on Escape and from the close button', async () => {
    serve('completed');
    const user = userEvent.setup();
    const onClose = renderDrawer();
    await screen.findByRole('heading', { name: 'Account locked after password reset' });

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing when no ticket is open', () => {
    render(
      <QueryClientProvider client={client()}>
        <TicketDrawer ticketId={null} onClose={() => {}} />
      </QueryClientProvider>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('the reason and the replay button', () => {
  it('names why a failed ticket gave up and offers to resume at the draft', async () => {
    serve('failed', { phases: opsTicket('failed').phases });
    renderDrawer();
    expect(await screen.findByText('Draft retries exhausted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replay from draft' })).toBeInTheDocument();
  });

  it('resumes at triage when triage did not finish', async () => {
    serve('needs_attention', {
      phases: { triage: { status: 'failed' }, draft: { status: 'pending' } },
    });
    renderDrawer();
    expect(await screen.findByText('Triage output invalid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replay from triage' })).toBeInTheDocument();
  });

  it.each<TicketStatus>(['completed', 'processing', 'queued'])(
    'is not offered for a %s ticket',
    async (status) => {
      serve(status);
      renderDrawer();
      await screen.findByRole('heading', { name: 'Account locked after password reset' });
      expect(screen.queryByRole('button', { name: /replay/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/Draft output invalid|retries exhausted/)).not.toBeInTheDocument();
    }
  );
});

describe('replaying', () => {
  let posts: number;
  beforeEach(() => {
    posts = 0;
    serve('needs_attention');
  });

  const replayWith = (status: number, body: JsonBodyType) =>
    server.use(
      http.post('/api/tickets/:id/replay', ({ params }) => {
        posts++;
        expect(params.id).toBe(OPS_ID);
        return HttpResponse.json(body, { status });
      })
    );

  it('asks first, and Cancel sends nothing', async () => {
    const user = userEvent.setup();
    replayWith(200, { success: true, status: 'queued', previousStatus: 'needs_attention' });
    renderDrawer();

    await user.click(await screen.findByRole('button', { name: /Replay from/ }));
    const confirm = screen.getByRole('group', { name: 'Confirm replay' });
    expect(confirm).toHaveTextContent('This spends AI calls.');

    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Confirm replay' })).not.toBeInTheDocument();
    expect(posts).toBe(0);
  });

  it('requeues the ticket and says so', async () => {
    const user = userEvent.setup();
    replayWith(200, { success: true, status: 'queued', previousStatus: 'needs_attention' });
    renderDrawer();

    await user.click(await screen.findByRole('button', { name: /Replay from/ }));
    await user.click(
      within(screen.getByRole('group', { name: 'Confirm replay' })).getByRole('button', {
        name: 'Confirm',
      })
    );

    expect(
      await screen.findByText('TICK-1759993412345-A1B2C3D4 replayed. The team re-queued it.')
    ).toBeInTheDocument();
    expect(posts).toBe(1);
    // The confirm step is gone and the button is back.
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Confirm replay' })).not.toBeInTheDocument()
    );
  });

  it('shows a friendly message for a 409, because something else already moved it', async () => {
    const user = userEvent.setup();
    replayWith(409, {
      error: 'Ticket can only be replayed if status is failed or needs_attention',
      status: 'processing',
    });
    renderDrawer();
    await user.click(await screen.findByRole('button', { name: /Replay from/ }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Already moving again. Nothing to replay.')).toBeInTheDocument();
  });

  it('shows a friendly message for a 503, because the ticket was left as it was', async () => {
    const user = userEvent.setup();
    replayWith(503, { error: 'Could not requeue the ticket; it was left as it was. Try again.' });
    renderDrawer();
    await user.click(await screen.findByRole('button', { name: /Replay from/ }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(
      await screen.findByText("Couldn't requeue it, so it was left as it was. Try again.")
    ).toBeInTheDocument();
  });

  it('copes with a request that never reaches the server', async () => {
    const user = userEvent.setup();
    server.use(http.post('/api/tickets/:id/replay', () => HttpResponse.error()));
    renderDrawer();
    await user.click(await screen.findByRole('button', { name: /Replay from/ }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(
      await screen.findByText("Couldn't replay the ticket. Check your connection and try again.")
    ).toBeInTheDocument();
  });

  it('does not let a double click send two replays', async () => {
    const user = userEvent.setup();
    replayWith(200, { success: true, status: 'queued', previousStatus: 'needs_attention' });
    renderDrawer();
    await user.click(await screen.findByRole('button', { name: /Replay from/ }));
    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    await user.dblClick(confirmButton);
    await screen.findByText(/replayed. The team re-queued it/);
    expect(posts).toBe(1);
  });
});
