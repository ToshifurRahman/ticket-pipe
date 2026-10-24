import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '@/routes';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>
  );
}

describe('legal page', () => {
  it('privacy says what is collected, who handles it, and how long it is kept', () => {
    renderAt('/legal/privacy');
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByText(/subject and description/i)).toBeInTheDocument();
    expect(screen.getByText(/no accounts/i)).toBeInTheDocument();
    expect(screen.getByText(/Groq/)).toBeInTheDocument();
    expect(screen.getByText(/deleted 30 days/i)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/portfolio demo/i);
  });

  it('terms say it is a demo', () => {
    renderAt('/legal/terms');
    expect(screen.getByRole('heading', { level: 1, name: 'Terms' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/portfolio demo/i);
  });

  it('numbers the sections and marks the open document in the tabs', () => {
    renderAt('/legal/terms');
    const tabs = screen.getByRole('navigation', { name: 'Legal page' });
    expect(tabs.querySelector('[aria-current="page"]')).toHaveTextContent('Terms');
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(6);
  });

  it('switches documents from the tabs', async () => {
    const user = userEvent.setup();
    renderAt('/legal/privacy');
    await user.click(screen.getByRole('navigation', { name: 'Legal page' }).querySelector('a[href="/legal/terms"]')!);
    expect(screen.getByRole('heading', { level: 1, name: 'Terms' })).toBeInTheDocument();
  });

  it('links the GitHub page from the privacy questions', () => {
    renderAt('/legal/privacy');
    expect(screen.getByRole('link', { name: 'GitHub page' })).toHaveAttribute('href', expect.stringMatching(/\/issues$/));
  });

  it.each(['privacy', 'terms'])('redirects /%s to the legal page', (doc) => {
    renderAt(`/${doc}`);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(new RegExp(`^${doc}$`, 'i'));
  });

  it('shows the 404 for an unknown document', () => {
    renderAt('/legal/cookies');
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
  });
});
