import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './theme-toggle';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('ThemeToggle', () => {
  it('starts dark and names the target theme', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
  });

  it('flips the html class, color-scheme and saved choice', async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));

    const root = document.documentElement;
    expect(root).toHaveClass('light');
    expect(root).not.toHaveClass('dark');
    expect(root.style.colorScheme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument();
  });

  it('still toggles when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement).toHaveClass('light');
  });
});
