import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from './home';

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function renderHome() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

// Each frame's timer is scheduled by the render before it, so advance one step at a time.
function playDemo() {
  for (let i = 0; i < 5; i++) act(() => void vi.advanceTimersByTime(3_000));
}

function stubMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => sessionStorage.clear());

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('landing page', () => {
  beforeEach(() => stubMotion(false));

  it('renders every section', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1, name: /already understood/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /from inbox to answer/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Simple pricing' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Questions' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('sends the hero CTA and every pricing CTA to /new', async () => {
    const user = userEvent.setup();
    renderHome();
    const links = [
      screen.getByRole('link', { name: /submit a ticket/i }),
      ...screen.getAllByRole('link', { name: /try it|talk to us/i }),
    ];
    expect(links).toHaveLength(4);
    links.forEach((link) => expect(link).toHaveAttribute('href', '/new'));
    await user.click(links[0]);
    expect(screen.getByTestId('where')).toHaveTextContent('/new');
  });

  it('the track field opens a valid reference and rejects an invalid one', async () => {
    const user = userEvent.setup();
    renderHome();
    const field = screen.getByRole('textbox', { name: 'Ticket reference' });
    await user.type(field, 'nope{Enter}');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    await user.clear(field);
    await user.type(field, 'tick-1760000000000-7a4d2c9e{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/t/TICK-1760000000000-7A4D2C9E');
  });

  it('opens a FAQ answer', async () => {
    const user = userEvent.setup();
    renderHome();
    const summary = screen.getByText('Does a person ever see my ticket?');
    const details = summary.closest('details')!;
    expect(details.open).toBe(false);
    await user.click(summary);
    expect(details.open).toBe(true);
  });

  it('plays the demo to the reply, then replays it', () => {
    vi.useFakeTimers();
    renderHome();
    expect(screen.queryByRole('button', { name: /replay/i })).not.toBeInTheDocument();
    expect(document.body.textContent).toContain('Reviewing your request');

    playDemo();
    expect(screen.getByText('Reply from support')).toBeInTheDocument();
    const replay = screen.getByRole('button', { name: /replay/i });

    act(() => replay.click());
    expect(document.body.textContent).toContain('Reviewing your request');
    expect(screen.queryByRole('button', { name: /replay/i })).not.toBeInTheDocument();
  });

  it('marks the demo seen only once it reaches the reply', () => {
    vi.useFakeTimers();
    renderHome();
    act(() => void vi.advanceTimersByTime(2_000));
    expect(sessionStorage.getItem('demo-seen')).toBeNull();

    playDemo();
    expect(sessionStorage.getItem('demo-seen')).toBe('1');
  });

  it('skips the autoplay once the demo was seen this session, and still offers a replay', () => {
    vi.useFakeTimers();
    sessionStorage.setItem('demo-seen', '1');
    renderHome();
    expect(screen.getByText('Reply from support')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Reviewing your request');

    act(() => screen.getByRole('button', { name: /replay/i }).click());
    expect(document.body.textContent).toContain('Reviewing your request');
  });

  it('autoplays as usual when session storage is unavailable', () => {
    vi.useFakeTimers();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderHome();
    expect(document.body.textContent).toContain('Reviewing your request');
    playDemo();
    expect(screen.getByText('Reply from support')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('makes no network request while the demo plays', () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    renderHome();
    playDemo();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('landing page with reduced motion', () => {
  it('shows the finished demo at once, with no replay', () => {
    stubMotion(true);
    renderHome();
    expect(screen.getByText('Reply from support')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /replay/i })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Reviewing your request');
    expect(sessionStorage.getItem('demo-seen')).toBeNull();
  });
});
