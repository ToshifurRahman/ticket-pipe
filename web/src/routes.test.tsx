import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/lib/query-client';
import { createFakeSocket } from '@/test/fake-socket';
import { server } from '@/test/server';
import { TICKET_REF, ticketAt } from '@/test/ticket-fixtures';
import { AppRoutes } from './routes';

const fakeSocket = vi.hoisted(() => ({ current: null as ReturnType<typeof createFakeSocket> | null }));
vi.mock('@/lib/socket', () => ({ getSocket: () => fakeSocket.current }));

beforeEach(() => {
  fakeSocket.current = createFakeSocket();
  server.use(http.get('/api/tickets/ref/:ref', () => HttpResponse.json(ticketAt('queued'))));
});

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('routes', () => {
  it('shows the 404 page for unknown routes', () => {
    renderAt('/nope/nothing');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('resolves a deep link to the ticket page', async () => {
    renderAt(`/t/${TICKET_REF}`);
    expect(await screen.findByTestId('ticket-reference')).toHaveTextContent(TICKET_REF);
  });

  it('renders the ops route in the ops layout, without the track field or footer', async () => {
    server.use(http.get('/api/ops/session', () => HttpResponse.json({ signedIn: false })));
    renderAt('/ops');
    expect(await screen.findByRole('heading', { name: 'Ops console' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Ticket reference')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Privacy' })).not.toBeInTheDocument();
  });

  it('reaches the legal pages from the footer', async () => {
    const user = userEvent.setup();
    renderAt('/new');
    const footer = () => within(screen.getByRole('navigation', { name: 'Legal' }));
    await user.click(footer().getByRole('link', { name: 'Privacy' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    await user.click(footer().getByRole('link', { name: 'Terms' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Terms' })).toBeInTheDocument();
  });

  it('shows landing links only on /', () => {
    const { unmount } = renderAt('/');
    expect(screen.getByRole('link', { name: 'Rates' })).toBeInTheDocument();
    unmount();
    renderAt('/new');
    expect(screen.queryByRole('link', { name: 'Rates' })).not.toBeInTheDocument();
  });

  it('navigates to a ticket from the header track field', async () => {
    renderAt('/new');
    const input = screen.getAllByLabelText('Ticket reference')[0];
    await userEvent.type(input, 'tick-1759993412345-a1b2c3d4{enter}');
    expect(await screen.findByTestId('ticket-reference')).toHaveTextContent(TICKET_REF);
  });

  it('rejects a malformed reference without navigating', async () => {
    renderAt('/new');
    const input = screen.getAllByLabelText('Ticket reference')[0];
    await userEvent.type(input, 'hello{enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a reference like TICK-');
    expect(screen.getByRole('heading', { name: 'How can we help?' })).toBeInTheDocument();
  });
});
