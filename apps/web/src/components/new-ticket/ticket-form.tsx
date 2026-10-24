import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Turnstile, type TurnstileHandle } from '@/components/turnstile';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { TICKET_LIMITS, ticketFormSchema, type TicketFormValues } from '@/lib/ticket-form';
import { createTicket } from '@/lib/tickets-api';
import type { CreateTicketResponse } from '@/lib/types';
import { cn } from '@/lib/utils';

const FIELDS = ['subject', 'description'] as const;

type TicketFormProps = {
  onCreated: (ticket: CreateTicketResponse, subject: string) => void;
};

export function TicketForm({ onCreated }: TicketFormProps) {
  const turnstile = useRef<TurnstileHandle>(null);
  const [token, setToken] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // onTouched: a field is checked once it is left (or on submit), then live while it is
  // edited, so nobody is told off while still typing their first words.
  const form = useForm<TicketFormValues>({
    resolver: zodResolver(ticketFormSchema),
    mode: 'onTouched',
    defaultValues: { subject: '', description: '' },
  });

  const mutation = useMutation({ mutationFn: createTicket });

  async function submit(values: TicketFormValues) {
    if (!token) return;
    setSubmitError(null);
    const subject = values.subject.trim();
    try {
      const ticket = await mutation.mutateAsync({
        subject,
        description: values.description.trim(),
        turnstileToken: token,
      });
      onCreated(ticket, subject);
    } catch (error) {
      const fieldErrors = error instanceof ApiError && error.status === 400 ? error.fieldErrors : null;
      const known = FIELDS.filter((f) => typeof fieldErrors?.[f] === 'string');
      if (known.length > 0) {
        known.forEach((f, i) => form.setError(f, { message: fieldErrors![f] }, { shouldFocus: i === 0 }));
      } else {
        setSubmitError("We couldn't send your ticket. Please try again.");
      }
    } finally {
      // A Turnstile token is single-use, so every attempt needs a fresh one.
      turnstile.current?.reset();
    }
  }

  const descriptionLength = useWatch({ control: form.control, name: 'description' }).trim().length;
  const overLimit = descriptionLength > TICKET_LIMITS.description.max;
  const pending = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} noValidate aria-label="New ticket" className="grid gap-5 p-4 sm:p-5.5">
        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject</FormLabel>
              <FormControl>
                <Input placeholder="A short summary of the problem" autoComplete="off" {...field} />
              </FormControl>
              <FormMessage className="text-sm" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between gap-3">
                <FormLabel>Description</FormLabel>
                <span
                  className={cn('font-mono text-xs tabular-nums text-muted-foreground', overLimit && 'text-destructive')}
                  aria-hidden
                >
                  {descriptionLength} / {TICKET_LIMITS.description.max}
                </span>
              </div>
              <FormControl>
                <Textarea rows={7} className="resize-y" {...field} />
              </FormControl>
              <FormDescription className="text-sm">
                Include what you tried and any error messages.
                <span className="sr-only">
                  {' '}
                  {descriptionLength} of {TICKET_LIMITS.description.max} characters used.
                </span>
              </FormDescription>
              <FormMessage className="text-sm" />
            </FormItem>
          )}
        />

        {submitError && (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        )}

        <div className="flex flex-wrap items-end justify-between gap-4">
          <Turnstile ref={turnstile} onToken={setToken} />
          <Button type="submit" variant="solid" disabled={!token || pending}>
            {pending ? 'Sending...' : 'Submit ticket'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
