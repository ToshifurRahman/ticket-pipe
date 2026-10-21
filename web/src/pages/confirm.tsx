import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FormHeader } from '@/components/form/form-header';
import { FormBody, FormPanel } from '@/components/form/form-panel';
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

  const preview = useQuery({
    queryKey: ['confirm-preview', token],
    queryFn: () => previewConfirmation(token),
    retry: false,
  });
  const confirm = useMutation({ mutationFn: () => confirmNotification(token) });

  if (preview.isPending) {
    return (
      <p aria-busy="true" className="text-muted-foreground">
        Checking your link…
      </p>
    );
  }

  if (confirm.isSuccess) {
    const { referenceNumber, status, maskedEmail } = confirm.data;
    return (
      <Panel title="You're all set" referenceNumber={referenceNumber}>
        <span className="button-caps stamp-tilt animate-stamp-press-late justify-self-start border-2 border-current px-3 py-1 text-[0.8125rem] text-ply-triaged motion-reduce:animate-none">
          Confirmed
        </span>
        <p role="status">
          {status === 'completed'
            ? `Your reply is ready. We're emailing ${maskedEmail} too.`
            : (
              <>
                We'll email {maskedEmail} when there's news on{' '}
                <span className="font-mono whitespace-nowrap">{referenceNumber}</span>.
              </>
            )}
        </p>
        <div>
          <Button asChild variant="solid">
            <Link to={`/t/${referenceNumber}`} className="no-underline">
              View my ticket
            </Link>
          </Button>
        </div>
      </Panel>
    );
  }

  if (!preview.data?.valid || confirm.isError) {
    return (
      <Panel title="This link has expired or was already used" referenceNumber="-">
        <p>
          Nothing was changed. If you already confirmed, you'll get your email. Otherwise open your
          ticket to check.
        </p>
        <div>
          <Button asChild variant="solid">
            <Link to="/" className="no-underline">
              Back to home
            </Link>
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Confirm your email" referenceNumber={preview.data.referenceNumber ?? '-'}>
      <p>
        Send updates about <strong className="font-mono">{preview.data.referenceNumber}</strong> to{' '}
        <strong>{preview.data.maskedEmail}</strong>?
      </p>
      <div>
        <Button variant="solid" onClick={() => confirm.mutate()} disabled={confirm.isPending}>
          {confirm.isPending ? 'Confirming...' : 'Confirm'}
        </Button>
      </div>
    </Panel>
  );
}

function Panel({
  title,
  referenceNumber,
  children,
}: {
  title: string;
  referenceNumber: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-140">
      <FormPanel enter>
        <FormHeader kicker="Email confirmation" title={title} referenceNumber={referenceNumber} />
        <FormBody className="gap-5 [&_p]:m-0 [&_p]:text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
          {children}
        </FormBody>
      </FormPanel>
    </div>
  );
}
