import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { Turnstile, type TurnstileHandle } from '@/components/turnstile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { getNotification, notificationQueryKey, requestNotification } from '@/lib/notifications-api';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ERROR_COPY: Record<number, string> = {
  400: 'Enter a valid email address.',
  409: 'An email address is already set for this ticket.',
  429: 'Too many requests. Please try again later.',
};

/** Whether the thread may offer an email; shares the card's query, so it costs no request. */
export function useEmailOffered(ticketId: string): boolean {
  const { data } = useQuery({ queryKey: notificationQueryKey(ticketId), queryFn: () => getNotification(ticketId) });
  return !!data?.available && data.state === 'none';
}

/** "Email me when it's ready". Hidden when email is off or the ticket already has its reply. */
export function NotifyCard({ ticketId }: { ticketId: string }) {
  const queryClient = useQueryClient();
  const turnstile = useRef<TurnstileHandle>(null);
  const [email, setEmail] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: notificationQueryKey(ticketId), queryFn: () => getNotification(ticketId) });
  const mutation = useMutation({
    mutationFn: (input: { email: string; turnstileToken: string }) => requestNotification(ticketId, input),
    onSuccess: (view) => queryClient.setQueryData(notificationQueryKey(ticketId), view),
  });

  if (!data?.available) return null;

  if (data.state === 'pending') {
    return (
      <Card title="Check your inbox">
        <p role="status">
          We sent a confirmation link to <span className="font-medium text-foreground">{data.maskedEmail}</span>. Open it to
          confirm. The link works for 24 hours.
        </p>
      </Card>
    );
  }

  if (data.state === 'confirmed' || data.state === 'sent') {
    return (
      <Card title="You’ll get an email">
        <p role="status">
          {data.state === 'sent' ? 'We emailed' : 'We’ll email'}{' '}
          <span className="font-medium text-foreground">{data.maskedEmail}</span>{' '}
          {data.state === 'sent' ? 'about this ticket.' : 'when there’s news.'}
        </p>
      </Card>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const value = email.trim();
    if (!EMAIL_PATTERN.test(value)) return setError(ERROR_COPY[400]);
    if (!token) return;
    try {
      await mutation.mutateAsync({ email: value, turnstileToken: token });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(ERROR_COPY[status] ?? 'We couldn’t send the confirmation email. Please try again.');
      // A 409 means someone already set an address; show the real state instead of the form.
      if (status === 409) void queryClient.invalidateQueries({ queryKey: notificationQueryKey(ticketId) });
    } finally {
      turnstile.current?.reset();
    }
  }

  return (
    <Card title="Don’t want to wait?">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p>We’ll email you when your reply is ready. You’ll confirm your address first.</p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="notify-email">Email address</Label>
          <Input
            id="notify-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'notify-error' : undefined}
          />
          {error && (
            <p id="notify-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <div className="flex flex-col items-start gap-4">
          <Turnstile ref={turnstile} onToken={setToken} />
          <Button type="submit" disabled={!token || mutation.isPending}>
            {mutation.isPending ? (
              'Sending…'
            ) : (
              'Notify me'
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label="Email notification" className="ruled flex flex-col gap-3 p-4 text-sm text-muted-foreground">
      <h2 className="label-caps text-sm text-foreground">{title}</h2>
      {children}
    </section>
  );
}
