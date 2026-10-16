import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PAGE_SIZE, type OpsParams, type OpsSort } from '@/lib/ops-params';
import { humanize } from '@/lib/ops-ticket';
import { relativeTime } from '@/lib/relative-time';
import type { OpsTicketList } from '@/lib/types';
import { cn } from '@/lib/utils';
import { OpsStatusBadge } from './status-badge';

const URGENT = new Set(['high', 'urgent', 'critical']);

type TicketTableProps = {
  data: OpsTicketList | undefined;
  params: OpsParams;
  loading: boolean;
  failed: boolean;
  onSort: (sort: OpsSort) => void;
  onPage: (page: number) => void;
  onOpen: (id: string) => void;
  onRetry: () => void;
};

function SortHeader({ label, column, params, onSort, className }: {
  label: string;
  column: OpsSort;
  params: OpsParams;
  onSort: (sort: OpsSort) => void;
  className?: string;
}) {
  const active = params.sort === column;
  const Icon = !active ? ChevronsUpDown : params.order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (params.order === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn('px-3 py-2 font-medium', className)}>
      <button type="button" onClick={() => onSort(column)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        <Icon aria-hidden className="size-3.5" />
      </button>
    </th>
  );
}

export function TicketTable({ data, params, loading, failed, onSort, onPage, onOpen, onRetry }: TicketTableProps) {
  if (failed && !data) {
    return (
      <div role="alert" className="rounded-xl border border-border bg-card/70 p-8 text-center">
        <p className="text-sm text-muted-foreground">Couldn't load the tickets.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  const from = data && data.total > 0 ? (data.page - 1) * PAGE_SIZE + 1 : 0;
  const to = data ? Math.min(data.page * PAGE_SIZE, data.total) : 0;
  const lastPage = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="rounded-xl border border-border bg-card/70">
      <div className="overflow-x-auto">
        <table className="w-full min-w-(--table-min) text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Ref</th>
              <th scope="col" className="px-3 py-2 font-medium">Subject</th>
              <th scope="col" className="px-3 py-2 font-medium">Category</th>
              <th scope="col" className="px-3 py-2 font-medium">Priority</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <SortHeader label="Updated" column="updatedAt" params={params} onSort={onSort} />
              <SortHeader label="Created" column="createdAt" params={params} onSort={onSort} />
            </tr>
          </thead>
          <tbody aria-busy={loading}>
            {data?.tickets.map((ticket) => (
              <tr
                key={ticket.id}
                onClick={() => onOpen(ticket.id)}
                className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-accent/40"
              >
                <td className="px-3 py-2.5 font-mono text-xs">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(ticket.id);
                    }}
                    aria-label={`Open ${ticket.referenceNumber}`}
                    className="text-left"
                  >
                    {ticket.referenceNumber}
                  </button>
                </td>
                <td className="max-w-(--cell-max) truncate px-3 py-2.5">{ticket.subject}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{ticket.category ? humanize(ticket.category) : 'Not yet'}</td>
                <td className={cn('px-3 py-2.5', ticket.priority && URGENT.has(ticket.priority) ? 'text-warning' : 'text-muted-foreground')}>
                  {ticket.priority ? humanize(ticket.priority) : 'Not yet'}
                </td>
                <td className="px-3 py-2.5"><OpsStatusBadge status={ticket.status} /></td>
                <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{relativeTime(ticket.updatedAt)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{relativeTime(ticket.createdAt)}</td>
              </tr>
            ))}
            {loading && !data &&
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td colSpan={7} className="px-3 py-3"><div className="h-4 animate-pulse rounded bg-muted" /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {data && data.tickets.length === 0 && (
        <p className="px-3 py-10 text-center text-sm text-muted-foreground">No tickets here.</p>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <span aria-live="polite">{data ? `${from} to ${to} of ${data.total}` : ''}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!data || data.page <= 1} onClick={() => onPage(params.page - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={!data || data.page >= lastPage} onClick={() => onPage(params.page + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
