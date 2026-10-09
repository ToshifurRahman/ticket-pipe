import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createQueryClient } from '@/lib/query-client';
import { AppRoutes } from './routes';

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

  it('resolves a deep link to the ticket stub', () => {
    renderAt('/t/TICK-1759993412345-A1B2C3D4');
    expect(screen.getByText('TICK-1759993412345-A1B2C3D4')).toBeInTheDocument();
  });

  it('renders the ops route in the ops layout, without the track field or footer', () => {
    renderAt('/ops');
    expect(screen.getByRole('heading', { name: 'Ops console' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Ticket reference')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Privacy' })).not.toBeInTheDocument();
  });

  it('shows landing links only on /', () => {
    const { unmount } = renderAt('/');
    expect(screen.getByRole('link', { name: 'Pricing' })).toBeInTheDocument();
    unmount();
    renderAt('/new');
    expect(screen.queryByRole('link', { name: 'Pricing' })).not.toBeInTheDocument();
  });

  it('navigates to a ticket from the header track field', async () => {
    renderAt('/new');
    const input = screen.getAllByLabelText('Ticket reference')[0];
    await userEvent.type(input, 'tick-1759993412345-a1b2c3d4{enter}');
    expect(await screen.findByText('TICK-1759993412345-A1B2C3D4')).toBeInTheDocument();
  });

  it('rejects a malformed reference without navigating', async () => {
    renderAt('/new');
    const input = screen.getAllByLabelText('Ticket reference')[0];
    await userEvent.type(input, 'hello{enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a reference like TICK-');
    expect(screen.getByRole('heading', { name: 'Submit a ticket' })).toBeInTheDocument();
  });
});
