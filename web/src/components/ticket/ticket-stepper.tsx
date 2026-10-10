import { Check } from 'lucide-react';
import type { Step } from '@/lib/ticket-thread';
import { cn } from '@/lib/utils';

// Received → Triaged → Drafted → Replied, from the design concept. Decorative for screen
// readers beyond the list itself: the thread's live region announces each change.
export function TicketStepper({ steps }: { steps: Step[] }) {
  return (
    <ol
      aria-label="Progress"
      className="grid grid-cols-4 rounded-xl border border-border bg-card/60 px-2 py-5 sm:px-6"
    >
      {steps.map((step, i) => {
        const next = steps[i + 1];
        return (
          <li
            key={step.label}
            data-state={step.state}
            aria-current={step.state === 'active' ? 'step' : undefined}
            className="relative flex flex-col items-center gap-2.5"
          >
            {next && (
              <span
                aria-hidden
                className={cn(
                  'absolute top-3.5 left-1/2 h-px w-full',
                  next.state === 'idle'
                    ? 'border-t border-dotted border-muted-foreground/50'
                    : 'bg-primary/80'
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                'relative z-10 flex size-7 items-center justify-center rounded-full border',
                step.state === 'done' && 'border-transparent bg-foreground text-background',
                step.state === 'active' && 'border-primary bg-background ring-4 ring-primary/25',
                step.state === 'idle' && 'border-muted-foreground/50 bg-background'
              )}
            >
              {step.state === 'done' && <Check className="size-3.5" strokeWidth={3} />}
              {step.state === 'active' && <span className="size-2 animate-pulse rounded-full bg-primary" />}
            </span>
            <span
              className={cn(
                'text-xs font-medium sm:text-sm',
                step.state === 'done' && 'text-foreground',
                step.state === 'active' && 'text-primary',
                step.state === 'idle' && 'text-muted-foreground'
              )}
            >
              {step.label}
              <span className="sr-only">
                {step.state === 'done' ? ' (done)' : step.state === 'active' ? ' (in progress)' : ''}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
