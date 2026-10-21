import { Button } from '@/components/ui/button';
import { PAGE_SIZE, type OpsParams, type OpsSort } from '@/lib/ops-params';
import { humanize } from '@/lib/ops-ticket';
import { shortAgo } from '@/lib/relative-time';
import type { OpsTicketList } from '@/lib/types';
import { cn } from '@/lib/utils';
import { OpsStatusBadge } from './status-badge';

const PRIORITY_TONE: Record<string, string> = {
  urgent: 'text-priority-urgent',
  critical: 'text-priority-urgent',
  high: 'text-priority-high',
};
const TH =
  'button-caps border-b border-border px-3 py-2.75 border-b border-border text-[0.6875rem] whitespace-nowrap text-muted-foreground';

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

function SortHeader({
  label,
  column,
  params,
  onSort,
}: {
  label: string;
  column: OpsSort;
  params: OpsParams;
  onSort: (sort: OpsSort) => void;
}) {
  const active = params.sort === column;
  return (
    <th
      scope="col"
      aria-sort={active ? (params.order === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={TH}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="cursor-pointer uppercase hover:text-foreground"
      >
        {label}
      </button>
    </th>
  );
}

export function TicketTable({
  data,
  params,
  loading,
  failed,
  onSort,
  onPage,
  onOpen,
  onRetry,
}: TicketTableProps) {
  if (failed && !data) {
    return (
      <div role="alert" className="border border-border bg-card p-8 text-center">
        <p className="m-0 text-sm text-muted-foreground">Couldn't load the tickets.</p>
        <Button variant="tb" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  const from = data && data.total > 0 ? (data.page - 1) * PAGE_SIZE + 1 : 0;
  const to = data ? Math.min(data.page * PAGE_SIZE, data.total) : 0;
  const lastPage = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-(--table-min) text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className={TH}>
                Ref
              </th>
              <th scope="col" className={TH}>
                Subject
              </th>
              <th scope="col" className={TH}>
                Category
              </th>
              <th scope="col" className={TH}>
                Priority
              </th>
              <th scope="col" className={TH}>
                Status
              </th>
              <SortHeader label="Updated" column="updatedAt" params={params} onSort={onSort} />
              <SortHeader label="Created" column="createdAt" params={params} onSort={onSort} />
            </tr>
          </thead>
          <tbody aria-busy={loading} className="[&_tr:last-child_td]:border-b-0">
            {data?.tickets.map((ticket) => (
              <tr
                key={ticket.id}
                onClick={() => onOpen(ticket.id)}
                className="cursor-pointer hover:bg-ply-received/5"
              >
                <td className="border-b border-border px-3 py-2.75 font-mono text-xs">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(ticket.id);
                    }}
                    aria-label={`Open ${ticket.referenceNumber}`}
                    className="cursor-pointer text-left"
                  >
                    {ticket.referenceNumber}
                  </button>
                </td>
                <td className="max-w-(--cell-max) truncate px-3 py-2.75 border-b border-border">
                  {ticket.subject}
                </td>
                <td className="px-3 py-2.75 border-b border-border text-muted-foreground">
                  {ticket.category ? humanize(ticket.category) : 'Not yet'}
                </td>
                <td
                  className={cn(
                    'border-b border-border px-3 py-2.75',
                    (ticket.priority && PRIORITY_TONE[ticket.priority]) ?? 'text-muted-foreground'
                  )}
                >
                  {ticket.priority ? humanize(ticket.priority) : 'Not yet'}
                </td>
                <td className="px-3 py-2.75 border-b border-border">
                  <OpsStatusBadge status={ticket.status} />
                </td>
                <td className="px-3 py-2.75 border-b border-border whitespace-nowrap text-muted-foreground">
                  {shortAgo(ticket.updatedAt)}
                </td>
                <td className="px-3 py-2.75 border-b border-border whitespace-nowrap text-muted-foreground">
                  {shortAgo(ticket.createdAt)}
                </td>
              </tr>
            ))}
            {data && data.tickets.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-9 text-center text-muted-foreground">
                  No tickets here.
                </td>
              </tr>
            )}
            {loading &&
              !data &&
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-3 py-3">
                    <div className="h-4 animate-pulse bg-muted" />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5 font-mono text-xs text-muted-foreground">
        <span aria-live="polite">{data ? `${from} to ${to} of ${data.total}` : ''}</span>
        <div className="flex gap-2">
          <Button
            variant="tb"
            className="px-3 py-1"
            disabled={!data || data.page <= 1}
            onClick={() => onPage(params.page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="tb"
            className="px-3 py-1"
            disabled={!data || data.page >= lastPage}
            onClick={() => onPage(params.page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
