import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCopy } from '@/hooks/use-copy';

type Props = {
  /** The printed second half of the caps line, e.g. "Customer copy" or "Not on file". */
  copyLine: string;
  title: string;
  /** The reference in the No. cell; "-" when there is none to show. */
  referenceNumber: string;
  copyable?: boolean;
  /** The title's heading level; the landing demo sits under the page's own h1. */
  as?: 'h1' | 'h2';
  /** Ink instead of the live red, for a copy that isn't a real ticket. */
  neutral?: boolean;
  /** Headings other than the subject, e.g. the not-found message, are not truncated. */
  children?: React.ReactNode;
};

// The head of the service form: printed caps, the subject, and the ruled No. cell.
export function TicketFormHeader({ copyLine, title, referenceNumber, copyable = true, as: Title = 'h1', neutral = false, children }: Props) {
  const [copy, copyText] = useCopy();

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-2">
        <p className={cn('label-caps text-xs sm:text-sm', neutral ? 'text-muted-foreground' : 'text-ply-live')}>Service ticket · {copyLine}</p>
        <Title className="text-2xl font-semibold tracking-tight break-words sm:text-3xl">{title}</Title>
        {children}
      </div>
      <div className="ruled flex shrink-0 items-center gap-3 self-start px-3 py-2">
        <span className="label-caps text-xs text-muted-foreground">No.</span>
        <span className="font-mono text-xs break-all sm:text-sm" data-testid={copyable ? "ticket-reference" : undefined}>
          {referenceNumber}
        </span>
        {copyable && (
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => copyText(referenceNumber)}>
            {copy === 'copied' ? <Check /> : <Copy />}
            {copy === 'copied' ? 'Copied' : 'Copy'}
          </Button>
        )}
        <span aria-live="polite" className="sr-only">
          {copy === 'copied' && 'Reference copied to clipboard'}
          {copy === 'failed' && "Couldn't copy the reference"}
        </span>
      </div>
    </header>
  );
}
