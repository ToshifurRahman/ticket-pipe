import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
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
    <section className="mx-auto mt-10 w-full max-w-sm rounded-2xl border border-border bg-card/70 p-6 shadow-xl backdrop-blur">
      <h1 className="text-xl font-semibold tracking-tight">Ops console</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in with the ops token to see every ticket.</p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
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
            <p id="ops-token-error" role="alert" className="text-sm text-destructive">
              {messageFor(mutation.error)}
            </p>
          )}
        </div>
        <Button type="submit" disabled={!token || mutation.isPending}>
          {mutation.isPending ? (
            <>
              <LoaderCircle className="animate-spin" /> Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>
    </section>
  );
}
