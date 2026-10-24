import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Stamp } from '@/components/form/stamp';
import { FormBody, FormPanel } from '@/components/form/form-panel';
import { FormHeader } from '@/components/form/form-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { opsKeys, signIn } from '@/lib/ops-api';

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "That token didn't work.";
    if (error.status === 429) return 'Too many attempts. Try again in a few minutes.';
    if (error.status === 503) return "Sign-in isn't set up on this server.";
  }
  return "Couldn't sign in. Check your connection and try again.";
}

const STAMP = 'border-3 border-current px-4 py-1.5 text-[1.25rem] motion-reduce:animate-none';

export function SignInCard() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState('');
  const mutation = useMutation({
    mutationFn: signIn,
    onSuccess: (session) => queryClient.setQueryData(opsKeys.session, session),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (token) mutation.mutate(token);
  }

  return (
    <div className="mx-auto max-w-140 pt-4">
      <FormPanel as="form" enter noValidate aria-label="Ops sign in" onSubmit={submit}>
        <FormHeader
          kicker="Restricted area"
          title="Ops console"
          numberLabel="Access"
          referenceNumber="Token"
        />
        <FormBody>
          <div className="flex flex-wrap gap-5 pt-2 pb-3">
            <Stamp className={`${STAMP} animate-stamp-press-delay-1 text-ply-drafted`}>
              Staff only
            </Stamp>
            <Stamp className={`${STAMP} animate-stamp-press-delay-2 text-ply-live-ink`}>
              Token required
            </Stamp>
          </div>
          <p className="m-0 text-base text-muted-foreground">
            Sign in with the ops token to see every ticket.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ops-token">Ops token</Label>
            <Input
              id="ops-token"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={token}
              aria-invalid={mutation.isError}
              aria-describedby={mutation.isError ? 'ops-token-error' : undefined}
              onChange={(e) => {
                setToken(e.target.value);
                if (mutation.isError) mutation.reset();
              }}
            />
            {mutation.isError && (
              <p id="ops-token-error" role="alert" className="m-0 text-sm text-destructive">
                {messageFor(mutation.error)}
              </p>
            )}
          </div>
          <Button variant="solid" type="submit" disabled={!token || mutation.isPending}>
            {mutation.isPending ? 'Signing in...' : 'Sign in'}
          </Button>
        </FormBody>
      </FormPanel>
    </div>
  );
}
