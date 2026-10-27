import { z } from 'zod/mini';

// The same limits and messages as TicketSchema in src/controllers/tickets.ts, so an inline
// error and a 400 from the API read the same. Web never imports src/, so they are repeated
// here; keep the two in step. Lengths count after trimming, as on the server.
export const TICKET_LIMITS = {
  subject: { min: 3, max: 120 },
  description: { min: 20, max: 5000 },
} as const;

function field(label: string, { min, max }: { min: number; max: number }) {
  return z.string().check(
    z.trim(),
    // Stop at "required" so an empty value is not also "too short" (Zod 4 runs every check).
    z.minLength(1, { error: `${label} is required`, abort: true }),
    z.minLength(min, `${label} needs at least ${min} characters.`),
    z.maxLength(max, `${label} can be at most ${max} characters.`)
  );
}

export const ticketFormSchema = z.object({
  subject: field('Subject', TICKET_LIMITS.subject),
  description: field('Description', TICKET_LIMITS.description),
});

export type TicketFormValues = z.input<typeof ticketFormSchema>;
