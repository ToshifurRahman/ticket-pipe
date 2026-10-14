import { TICKET_STATUSES_FOR_TABS } from './ops-ticket';

// The console's view state lives in the URL, so a reload keeps your place, Back closes the
// drawer, and one ticket can be linked.
export type OpsTab = 'all' | 'needs_attention' | 'failed' | 'completed';
export type OpsSort = 'updatedAt' | 'createdAt';

export type OpsParams = { tab: OpsTab; page: number; sort: OpsSort; order: 'asc' | 'desc'; ticket: string | null };

export const PAGE_SIZE = 20;
const TABS: OpsTab[] = ['all', ...TICKET_STATUSES_FOR_TABS];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseOpsParams(params: URLSearchParams): OpsParams {
  const tab = params.get('status') as OpsTab;
  const page = Number(params.get('page'));
  const sort = params.get('sort');
  const ticket = params.get('ticket');
  return {
    tab: TABS.includes(tab) ? tab : 'all',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    sort: sort === 'createdAt' ? 'createdAt' : 'updatedAt',
    order: params.get('order') === 'asc' ? 'asc' : 'desc',
    ticket: ticket && UUID.test(ticket) ? ticket : null,
  };
}

/** Only what differs from the defaults is written, so the default view is a clean `/ops`. */
export function toSearchParams(p: OpsParams): URLSearchParams {
  const out = new URLSearchParams();
  if (p.tab !== 'all') out.set('status', p.tab);
  if (p.page > 1) out.set('page', String(p.page));
  if (p.sort !== 'updatedAt') out.set('sort', p.sort);
  if (p.order !== 'desc') out.set('order', p.order);
  if (p.ticket) out.set('ticket', p.ticket);
  return out;
}

/** The query string for GET /api/tickets. */
export function listQuery(p: OpsParams): string {
  const query = new URLSearchParams({ page: String(p.page), limit: String(PAGE_SIZE), sort: p.sort, order: p.order });
  if (p.tab !== 'all') query.set('status', p.tab);
  return query.toString();
}
