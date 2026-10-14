import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PrivacyPage, TermsPage } from './legal';

function renderPage(page: React.ReactElement) {
  return render(<MemoryRouter>{page}</MemoryRouter>);
}

describe('legal pages', () => {
  it('privacy says what is collected, who handles it, and how long it is kept', () => {
    renderPage(<PrivacyPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByText(/subject and description/i)).toBeInTheDocument();
    expect(screen.getByText(/no accounts/i)).toBeInTheDocument();
    expect(screen.getByText(/Groq/)).toBeInTheDocument();
    expect(screen.getByText(/deleted 30 days/i)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/portfolio demo/i);
  });

  it('terms say it is a demo', () => {
    renderPage(<TermsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Terms' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/portfolio demo/i);
  });
});
