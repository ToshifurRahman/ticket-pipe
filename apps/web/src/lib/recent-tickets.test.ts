import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRecentTicket, loadRecentTickets, RECENT_TICKETS_LIMIT, useRecentTickets, type RecentTicket } from './recent-tickets';

const ticket = (n: number): RecentTicket => ({
  ref: `TICK-175999341234${n}-A1B2C3D4`,
  subject: `Subject ${n}`,
  createdAt: '2026-10-10T10:00:00.000Z',
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('addRecentTicket', () => {
  it('puts the newest first and keeps one entry per ref', () => {
    const list = addRecentTicket(addRecentTicket([ticket(1), ticket(2)], ticket(3)), ticket(1));
    expect(list.map((t) => t.subject)).toEqual(['Subject 1', 'Subject 3', 'Subject 2']);
  });

  it(`keeps at most ${RECENT_TICKETS_LIMIT}`, () => {
    let list: RecentTicket[] = [];
    for (let n = 0; n < 8; n++) list = addRecentTicket(list, ticket(n));
    expect(list).toHaveLength(RECENT_TICKETS_LIMIT);
    expect(list[0]).toEqual(ticket(7));
  });
});

describe('loadRecentTickets', () => {
  it('ignores corrupt or foreign data', () => {
    localStorage.setItem('recent-tickets', '{not json');
    expect(loadRecentTickets()).toEqual([]);
    localStorage.setItem('recent-tickets', JSON.stringify([ticket(1), { ref: 42 }, 'nope']));
    expect(loadRecentTickets()).toEqual([ticket(1)]);
  });

  it('returns an empty list when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadRecentTickets()).toEqual([]);
  });
});

describe('useRecentTickets', () => {
  it('persists remembered tickets and forgets them again', () => {
    const { result } = renderHook(() => useRecentTickets());
    act(() => result.current.remember(ticket(1)));
    act(() => result.current.remember(ticket(2)));
    expect(loadRecentTickets()).toEqual([ticket(2), ticket(1)]);

    act(() => result.current.forget(ticket(2).ref));
    expect(result.current.tickets).toEqual([ticket(1)]);
    expect(loadRecentTickets()).toEqual([ticket(1)]);
  });

  it('still remembers in memory when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useRecentTickets());
    act(() => result.current.remember(ticket(1)));
    act(() => result.current.remember(ticket(2)));
    expect(result.current.tickets).toEqual([ticket(2), ticket(1)]);
  });
});
