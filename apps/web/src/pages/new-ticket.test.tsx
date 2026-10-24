import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useEffect, useImperativeHandle, type Ref } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TurnstileHandle } from '@/components/turnstile';
import { createQueryClient } from '@/lib/query-client';
import { server } from '@/test/server';
import { NewTicketPage } from './new-ticket';

// Turnstile is Cloudflare's script; here it solves at once unless a test says otherwise.
const turnstile = vi.hoisted(() => ({ autoSolve: true, resets: 0 }));

vi.mock('@/components/turnstile', () => ({
  Turnstile({ onToken, ref }: { onToken: (t: string | null) => void; ref?: Ref<TurnstileHandle> }) {
    useImperativeHandle(ref, () => ({
      reset() {
        turnstile.resets++;
        onToken(null);
        if (turnstile.autoSolve) setTimeout(() => onToken(`token-${turnstile.resets}`));
      },
    }));
    useEffect(() => {
      if (turnstile.autoSolve) onToken('token-0');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="turnstile" />;
  },
}));

const REF = 'TICK-1759993412345-A1B2C3D4';
const SUBJECT = 'CSV export never starts';
const DESCRIPTION = 'The export button spins for a few seconds and then nothing downloads.';

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/new']}>
        <NewTicketPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

type Posted = { subject: string; description: string; turnstileToken: string };

function acceptTickets(status: string = 'queued') {
  const posted: Posted[] = [];
  server.use(
    http.post('/api/tickets', async ({ request }) => {
      posted.push((await request.json()) as Posted);
      return HttpResponse.json(
        { ticketId: 'b7c1', referenceNumber: REF, status: 'queued', createdAt: new Date().toISOString() },
        { status: 201 }
      );
    }),
    http.get('/api/tickets/ref/:ref', ({ params }) =>
      HttpResponse.json({ referenceNumber: params.ref, subject: SUBJECT, status, createdAt: new Date().toISOString() })
    )
  );
  return posted;
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Subject'), SUBJECT);
  await user.type(screen.getByLabelText('Description'), DESCRIPTION);
}

beforeEach(() => {
  turnstile.autoSolve = true;
  turnstile.resets = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('NewTicketPage: validation', () => {
  it('flags a too-short subject once the field is left, and clears it as the user fixes it', async () => {
    const user = userEvent.setup();
    renderPage();
    const subject = screen.getByLabelText('Subject');

    await user.type(subject, 'Re');
    expect(screen.queryByText('Subject needs at least 3 characters.')).not.toBeInTheDocument();
    await user.tab();

    expect(await screen.findByText('Subject needs at least 3 characters.')).toBeInTheDocument();
    expect(subject).toHaveAttribute('aria-invalid', 'true');
    expect(subject.getAttribute('aria-describedby')).toContain(
      screen.getByText('Subject needs at least 3 characters.').id
    );

    await user.type(subject, 'port broken');
    await waitFor(() => expect(screen.queryByText('Subject needs at least 3 characters.')).not.toBeInTheDocument());
  });

  it('rejects too-long values inline and never calls the API', async () => {
    const user = userEvent.setup();
    const posted = acceptTickets();
    renderPage();

    await user.click(screen.getByLabelText('Subject'));
    await user.paste('a'.repeat(121));
    await user.click(screen.getByLabelText('Description'));
    await user.paste('x'.repeat(5001));
    await user.click(screen.getByRole('button', { name: /Submit ticket/ }));

    expect(await screen.findByText('Subject can be at most 120 characters.')).toBeInTheDocument();
    expect(screen.getByText('Description can be at most 5000 characters.')).toBeInTheDocument();
    // Nothing is cut off: the full paste stays in the field.
    expect(screen.getByLabelText<HTMLInputElement>('Subject').value).toHaveLength(121);
    expect(posted).toHaveLength(0);
  });

  it('shows a live, trimmed character counter that turns red past the limit', async () => {
    const user = userEvent.setup();
    renderPage();
    const description = screen.getByLabelText('Description');

    await user.type(description, '  hello  ');
    const counter = screen.getByText('5 / 5000');
    expect(counter).not.toHaveClass('text-destructive');

    await user.clear(description);
    await user.click(description);
    await user.paste('x'.repeat(5001));
    expect(screen.getByText('5001 / 5000')).toHaveClass('text-destructive');
  });

  it('keeps Submit disabled until the verification check passes', () => {
    turnstile.autoSolve = false;
    renderPage();
    expect(screen.getByRole('button', { name: /Submit ticket/ })).toBeDisabled();
  });

  it('puts a 400 from the API on the matching fields', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/tickets', () =>
        HttpResponse.json({ errors: { description: 'Description needs at least 20 characters.' } }, { status: 400 })
      )
    );
    renderPage();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /Submit ticket/ }));

    expect(await screen.findByText('Description needs at least 20 characters.')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toHaveFocus();
    expect(turnstile.resets).toBe(1);
  });

  it('keeps the values and shows a retry message when the API fails', async () => {
    const user = userEvent.setup();
    server.use(http.post('/api/tickets', () => HttpResponse.json({ error: 'boom' }, { status: 500 })));
    renderPage();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /Submit ticket/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't send your ticket. Please try again.");
    expect(screen.getByLabelText('Subject')).toHaveValue(SUBJECT);
    expect(screen.getByLabelText('Description')).toHaveValue(DESCRIPTION);
    expect(turnstile.resets).toBe(1);
    // The fresh token re-enables Submit for the retry.
    await waitFor(() => expect(screen.getByRole('button', { name: /Submit ticket/ })).toBeEnabled());
  });
});

describe('NewTicketPage: success', () => {
  it('sends trimmed values with the Turnstile token and shows the reference', async () => {
    const user = userEvent.setup();
    const posted = acceptTickets();
    renderPage();

    await user.type(screen.getByLabelText('Subject'), `  ${SUBJECT}  `);
    await user.type(screen.getByLabelText('Description'), DESCRIPTION);
    await user.click(screen.getByRole('button', { name: /Submit ticket/ }));

    const heading = await screen.findByRole('heading', { name: "We're on it" });
    expect(heading).toHaveFocus();
    expect(screen.getByTestId('ticket-reference')).toHaveTextContent(REF);
    expect(screen.getByRole('link', { name: /Watch it live/ })).toHaveAttribute('href', `/t/${REF}`);
    expect(posted).toEqual([{ subject: SUBJECT, description: DESCRIPTION, turnstileToken: 'token-0' }]);
  });

  it('copies the reference to the clipboard', async () => {
    const user = userEvent.setup();
    acceptTickets();
    renderPage();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /Submit ticket/ }));

    // userEvent.setup() installs a clipboard stub; spy on it after setup.
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(await screen.findByRole('button', { name: 'Copy reference' }));
    expect(writeText).toHaveBeenCalledWith(REF);
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument();
  });

  it('tells the user when copying is not possible', async () => {
    const user = userEvent.setup();
    acceptTickets();
    renderPage();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /Submit ticket/ }));

    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    await user.click(await screen.findByRole('button', { name: 'Copy reference' }));
    expect(await screen.findByText(/Couldn't copy/)).toBeInTheDocument();
  });

  it('remembers the ticket under recent tickets, after a reload too', async () => {
    const user = userEvent.setup();
    acceptTickets();
    const { unmount } = renderPage();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /Submit ticket/ }));
    await screen.findByRole('heading', { name: "We're on it" });
    unmount();

    renderPage();
    const recent = screen.getByRole('region', { name: 'Your recent tickets' });
    const link = within(recent).getByRole('link', { name: new RegExp(SUBJECT) });
    expect(link).toHaveAttribute('href', `/t/${REF}`);
    expect(link).toHaveTextContent(REF);
    expect(await within(link).findByText('Processing')).toBeInTheDocument();
  });

  it('returns to an empty form with "Submit another ticket"', async () => {
    const user = userEvent.setup();
    acceptTickets();
    renderPage();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /Submit ticket/ }));
    await user.click(await screen.findByRole('button', { name: 'Submit another ticket' }));

    expect(screen.getByLabelText('Subject')).toHaveValue('');
    expect(screen.getByLabelText('Description')).toHaveValue('');
  });

  it('works with the keyboard alone', async () => {
    const user = userEvent.setup();
    const posted = acceptTickets();
    renderPage();

    await user.tab();
    expect(screen.getByLabelText('Subject')).toHaveFocus();
    await user.keyboard(SUBJECT);
    await user.tab();
    expect(screen.getByLabelText('Description')).toHaveFocus();
    await user.keyboard(DESCRIPTION);
    await user.tab();
    expect(screen.getByRole('button', { name: /Submit ticket/ })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { name: "We're on it" })).toHaveFocus();
    expect(posted).toHaveLength(1);
  });
});

describe('NewTicketPage: recent tickets', () => {
  function seed(...refs: string[]) {
    localStorage.setItem(
      'recent-tickets',
      JSON.stringify(refs.map((ref, i) => ({ ref, subject: `Subject ${i}`, createdAt: new Date().toISOString() })))
    );
  }

  it('is hidden when this browser has no tickets', () => {
    renderPage();
    expect(screen.queryByRole('region', { name: 'Your recent tickets' })).not.toBeInTheDocument();
  });

  it.each([
    ['queued', 'Processing'],
    ['processing', 'Processing'],
    ['completed', 'Replied'],
    ['failed', 'With our team'],
    ['needs_attention', 'With our team'],
  ])('shows a %s ticket as "%s"', async (status, label) => {
    acceptTickets(status);
    seed(REF);
    renderPage();
    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it('drops a ticket the API no longer knows', async () => {
    const GONE = 'TICK-1759993412345-DEADBEEF';
    server.use(
      http.get('/api/tickets/ref/:ref', ({ params }) =>
        params.ref === GONE
          ? HttpResponse.json({ error: 'Ticket not found' }, { status: 404 })
          : HttpResponse.json({ referenceNumber: REF, subject: 'Subject 1', status: 'completed', createdAt: '' })
      )
    );
    seed(GONE, REF);
    renderPage();

    await waitFor(() => expect(screen.queryByText(new RegExp(GONE))).not.toBeInTheDocument());
    expect(screen.getByText(new RegExp(REF))).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('recent-tickets')!)).toHaveLength(1);
  });
});
