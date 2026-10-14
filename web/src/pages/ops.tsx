import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { KpiStrip } from '@/components/ops/kpi-strip';
import { SignInCard } from '@/components/ops/sign-in-card';
import { StatusTabs } from '@/components/ops/status-tabs';
import { TicketDrawer } from '@/components/ops/ticket-drawer';
import { TicketTable } from '@/components/ops/ticket-table';
import { Button } from '@/components/ui/button';
import { brand } from '@/config/brand';
import { useOpsFeed, type OpsAlert } from '@/hooks/use-ops-feed';
import { ApiError } from '@/lib/api';
import { getOpsSession, listTickets, opsKeys } from '@/lib/ops-api';
import { listQuery, parseOpsParams, toSearchParams, type OpsParams, type OpsSort, type OpsTab } from '@/lib/ops-params';
import { humanize } from '@/lib/ops-ticket';

export function OpsPage() {
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: opsKeys.session, queryFn: getOpsSession });
  const signedIn = session.data?.signedIn === true;

  useEffect(() => {
    document.title = `Ops · ${brand.name}`;
  }, []);

  // Once signed out, drop whatever the last operator had loaded.
  useEffect(() => {
    if (session.data && !session.data.signedIn) queryClient.removeQueries({ queryKey: opsKeys.all });
  }, [session.data, queryClient]);

  if (session.isPending) return <div className="mt-10 h-40 animate-pulse rounded-xl bg-muted" />;
  if (session.isError) {
    return (
      <div role="alert" className="mx-auto mt-10 max-w-sm text-center">
        <p className="text-sm text-muted-foreground">Couldn't reach the server.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void session.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  return signedIn ? <OpsConsole /> : <SignInCard />;
}

function alertMessage(alert: OpsAlert): string {
  return `${alert.referenceNumber} ${alert.kind === 'failed' ? 'failed' : 'needs attention'}: ${humanize(alert.reason)}`;
}

function OpsConsole() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = parseOpsParams(searchParams);

  const query = listQuery(params);
  const list = useQuery({
    queryKey: opsKeys.list(query),
    queryFn: () => listTickets(query),
    // Keep the old rows on screen while the next page or tab loads.
    placeholderData: keepPreviousData,
  });

  const markSignedOut = useCallback(
    () => queryClient.setQueryData(opsKeys.session, { signedIn: false }),
    [queryClient]
  );

  // A 401 from any console request means the session ended (expired, or signed out elsewhere).
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        const error = event.type === 'updated' && event.action.type === 'error' ? event.action.error : null;
        if (error instanceof ApiError && error.status === 401 && event.query.queryKey[0] === 'ops') markSignedOut();
      }),
    [queryClient, markSignedOut]
  );

  const go = useCallback(
    (next: OpsParams, { push = false } = {}) => setSearchParams(toSearchParams(next), { replace: !push }),
    [setSearchParams]
  );

  const onAlert = useCallback(
    (alert: OpsAlert) => {
      const show = alert.kind === 'failed' ? toast.error : toast.warning;
      show(alertMessage(alert), {
        action: { label: 'Open', onClick: () => go({ ...parseOpsParams(new URLSearchParams(window.location.search)), ticket: alert.ticketId }, { push: true }) },
      });
    },
    [go]
  );

  useOpsFeed({ enabled: true, onSignedOut: markSignedOut, onAlert });

  const onSort = (sort: OpsSort) =>
    go({ ...params, page: 1, sort, order: params.sort === sort && params.order === 'desc' ? 'asc' : 'desc' });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Ops console</h1>
      <KpiStrip />
      <StatusTabs tab={params.tab} counts={list.data?.counts} onChange={(tab: OpsTab) => go({ ...params, tab, page: 1 })} />
      <TicketTable
        data={list.data}
        params={params}
        loading={list.isPending}
        failed={list.isError}
        onSort={onSort}
        onPage={(page) => go({ ...params, page })}
        onOpen={(ticket) => go({ ...params, ticket }, { push: true })}
        onRetry={() => void list.refetch()}
      />
      <TicketDrawer ticketId={params.ticket} onClose={() => go({ ...params, ticket: null })} />
    </div>
  );
}
