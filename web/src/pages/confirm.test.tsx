import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createQueryClient } from '@/lib/query-client';
import { server } from '@/test/server';
import { TICKET_REF } from '@/test/ticket-fixtures';
import { ConfirmPage } from './confirm';

function renderPage() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/confirm/abc']}>
        <Routes>
          <Route path="/confirm/:token" element={<ConfirmPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('confirm page', () => {
  it('only confirms when the button is pressed', async () => {
    let confirms = 0;
    server.use(
      http.get('/api/notifications/confirm/abc', () =>
        HttpResponse.json({
          valid: true,
          referenceNumber: TICKET_REF,
          maskedEmail: 't•••@example.test',
        })
      ),
      http.post('/api/notifications/confirm', () => {
        confirms++;
        return HttpResponse.json({
          referenceNumber: TICKET_REF,
          status: 'processing',
          maskedEmail: 't•••@example.test',
        });
      })
    );
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Confirm your email' })).toBeInTheDocument();
    expect(confirms).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('heading', { name: "You're all set" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View my ticket' })).toHaveAttribute(
      'href',
      `/t/${TICKET_REF}`
    );
    expect(confirms).toBe(1);
  });

  it('shows a neutral message for an expired or used link', async () => {
    server.use(
      http.get('/api/notifications/confirm/abc', () => HttpResponse.json({ valid: false }))
    );
    renderPage();
    expect(
      await screen.findByRole('heading', { name: /expired or was already used/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
  });
});
