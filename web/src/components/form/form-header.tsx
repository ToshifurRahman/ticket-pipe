import { Button } from '@/components/ui/button';
import { useCopy } from '@/hooks/use-copy';

type Props = {
  /** The printed caps line, e.g. "Service ticket · Customer copy". */
  kicker: string;
  title: string;
  /** What the right-hand cell is called; a ticket's is "No.". */
  numberLabel?: string;
  /** The value in that cell; "-" when there is none to show. */
  referenceNumber: string;
  /** Adds a Copy button under the number. */
  copyable?: boolean;
  /** The title's heading level; the landing sample sits under the page's own h1. */
  as?: 'h1' | 'h2';
  children?: React.ReactNode;
};

// The head of a service form: printed caps and a title, beside the ruled No. cell.
export function FormHeader({
  kicker,
  title,
  numberLabel = 'No.',
  referenceNumber,
  copyable = false,
  as: Title = 'h1',
  children,
}: Props) {
  const [copy, copyText] = useCopy();

  return (
    <header className="grid border-b border-rule sm:grid-cols-[1fr_auto]">
      <div className="flex min-w-0 flex-col gap-1.5 p-4 sm:px-5.5 sm:py-4.5">
        <p className="label-caps text-xs text-muted-foreground">{kicker}</p>
        <Title className="text-2xl font-semibold tracking-tight break-words text-balance">{title}</Title>
        {children}
      </div>
      <div className="flex flex-col gap-1.5 border-t border-rule p-4 sm:border-t-0 sm:border-l sm:px-5.5 sm:py-4.5 sm:text-right">
        <p className="label-caps text-xs text-muted-foreground">{numberLabel}</p>
        <p className="font-mono text-sm break-all" data-testid={copyable ? 'ticket-reference' : undefined}>
          {referenceNumber}
        </p>
        {copyable && (
          <div className="flex items-center gap-2 sm:justify-end">
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => copyText(referenceNumber)}>
              {copy === 'copied' ? 'Copied' : 'Copy'}
            </Button>
            <span aria-live="polite" className="sr-only">
              {copy === 'copied' && 'Reference copied to clipboard'}
              {copy === 'failed' && "Couldn't copy the reference"}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
