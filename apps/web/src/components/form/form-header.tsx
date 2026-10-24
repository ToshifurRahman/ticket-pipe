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
  /** Makes the title programmatically focusable, so a result can hand focus to it. */
  titleRef?: React.Ref<HTMLHeadingElement>;
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
  titleRef,
  children,
}: Props) {
  const [copy, copyText] = useCopy();

  return (
    <header className="grid border-b border-rule sm:grid-cols-[1fr_auto]">
      <div className="flex min-w-0 flex-col gap-1.5 px-5.5 py-4.5">
        <p className="label-caps text-xs text-muted-foreground">{kicker}</p>
        <Title
          ref={titleRef}
          tabIndex={titleRef ? -1 : undefined}
          className="text-[1.625rem] leading-[1.15] font-semibold tracking-[-0.01em] break-words text-balance outline-none"
        >
          {title}
        </Title>
        {children}
      </div>
      <div className="flex flex-col gap-1.5 border-t border-rule px-5.5 py-4.5 sm:border-t-0 sm:border-l sm:text-right">
        <p className="label-caps text-xs text-muted-foreground">{numberLabel}</p>
        <p className="font-mono text-meta break-all" data-testid={copyable ? 'ticket-reference' : undefined}>
          {referenceNumber}
        </p>
        {copyable && (
          <div className="flex items-center justify-end gap-2">
            <Button variant="tb" className="px-2 py-0.5 text-caption" onClick={() => copyText(referenceNumber)}>
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
