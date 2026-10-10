import { useCallback, useState } from 'react';

// Refs this browser submitted, so a customer can find a ticket again without an account.
// Storage can be missing or throw (private mode, blocked site data); every access is
// guarded and the list then simply stays in memory or empty.

export type RecentTicket = { ref: string; subject: string; createdAt: string };

const KEY = 'recent-tickets';
export const RECENT_TICKETS_LIMIT = 5;

function isRecentTicket(value: unknown): value is RecentTicket {
  const v = value as Partial<RecentTicket> | null;
  return (
    !!v && typeof v.ref === 'string' && typeof v.subject === 'string' && typeof v.createdAt === 'string'
  );
}

export function loadRecentTickets(): RecentTicket[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isRecentTicket).slice(0, RECENT_TICKETS_LIMIT) : [];
  } catch {
    return [];
  }
}

function save(list: RecentTicket[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: the list just won't survive a reload */
  }
}

/** Newest first, one entry per ref, at most RECENT_TICKETS_LIMIT. */
export function addRecentTicket(list: RecentTicket[], ticket: RecentTicket): RecentTicket[] {
  return [ticket, ...list.filter((t) => t.ref !== ticket.ref)].slice(0, RECENT_TICKETS_LIMIT);
}

export function useRecentTickets() {
  const [tickets, setTickets] = useState<RecentTicket[]>(loadRecentTickets);

  // Built from the in-memory list, so it still works when storage is unavailable. The
  // updater only writes the same value again if React calls it twice.
  const remember = useCallback((ticket: RecentTicket) => {
    setTickets((current) => {
      const next = addRecentTicket(current, ticket);
      save(next);
      return next;
    });
  }, []);

  const forget = useCallback((ref: string) => {
    setTickets((current) => {
      const next = current.filter((t) => t.ref !== ref);
      save(next);
      return next;
    });
  }, []);

  return { tickets, remember, forget };
}
