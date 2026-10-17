import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ticketPlies } from '@/lib/ticket-thread';
import { ticketAt } from '@/test/ticket-fixtures';
import { PlyRow } from './ply-row';

const stamped = () => document.querySelectorAll('.animate-stamp').length;

describe('PlyRow', () => {
  it('does not stamp what is already there on first render', () => {
    render(<PlyRow plies={ticketPlies(ticketAt('writing'))} />);
    expect(stamped()).toBe(0);
  });

  it('stamps only the plies whose state changed', () => {
    const { rerender } = render(<PlyRow plies={ticketPlies(ticketAt('reviewing'))} />);
    rerender(<PlyRow plies={ticketPlies(ticketAt('writing'))} />);
    // triage went live → done, draft waiting → live
    expect(stamped()).toBe(2);
    rerender(<PlyRow plies={ticketPlies(ticketAt('writing'))} />);
    expect(stamped()).toBe(2);
  });

  it('strikes the on-hold ply and marks none current', () => {
    render(<PlyRow plies={ticketPlies(ticketAt('failed'))} />);
    expect(screen.queryByRole('listitem', { current: 'step' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[2]).toHaveAttribute('data-state', 'on-hold');
  });
});
