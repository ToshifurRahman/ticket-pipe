import { useMutation, useQuery } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { brand } from '@/config/brand';
import { confirmNotification, previewConfirmation } from '@/lib/notifications-api';

// The link in the email lands here, and only the button changes anything: mail scanners open
// links on their own, and a GET that confirmed would let them confirm for the customer.
export function ConfirmPage() {
  const token = useParams().token ?? '';

  useEffect(() => {
    document.title = `Confirm your email · ${brand.name}`;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const preview = useQuery({ queryKey: ['confirm-preview', token], queryFn: () => previewConfirmation(token), retry: false });
  const confirm = useMutation({ mutationFn: () => confirmNotification(token) });

  if (preview.isPending) {
    return <p aria-busy="true">Checking your link…</p>;
  }

  if (confirm.isSuccess) {
    const { referenceNumber, status, maskedEmail } = confirm.data;
    return (
      <Panel title="You’re all set">
        <p role="status" className="text-muted-foreground">
          {status === 'completed'
            ? `Your reply is ready. We’re emailing ${maskedEmail} too.`
            : `We’ll email ${maskedEmail} when there’s news on ${referenceNumber}.`}
        </p>
        <Button asChild>
          <Link to={`/t/${referenceNumber}`} className="text-primary-foreground no-underline hover:no-underline">
            View my ticket
          </Link>
        </Button>
      </Panel>
    );
  }

  if (!preview.data?.valid || confirm.isError) {
    return (
      <Panel title="This link has expired or was already used">
        <p className="text-muted-foreground">
          Nothing was changed. If you already confirmed, you’ll get your email. Otherwise open your ticket to check.
        </p>
        <p>
          <Link to="/">Back to home</Link>
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Confirm your email">
      <p className="text-muted-foreground">
        Send updates about {preview.data.referenceNumber} to{' '}
        <span className="font-medium text-foreground">{preview.data.maskedEmail}</span>?
      </p>
      <div>
        <Button onClick={() => confirm.mutate()} disabled={confirm.isPending}>
          {confirm.isPending ? (
            <>
              <LoaderCircle className="animate-spin" /> Confirming…
            </>
          ) : (
            'Confirm'
          )}
        </Button>
      </div>
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto flex max-w-lg flex-col gap-5 rounded-xl border border-border bg-card/60 p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
    </section>
  );
}
