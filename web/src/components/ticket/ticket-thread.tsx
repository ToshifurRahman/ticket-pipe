import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { printedTime } from '@/lib/relative-time';
import { humanize, type SupportSide, type TriageBadges } from '@/lib/ticket-thread';
import { cn } from '@/lib/utils';
import { ToneChip, toneForCategory, toneForPriority } from './tone-chip';
import { stampProps, useStampOnChange } from './use-stamp-on-change';

/** Shown when failed or needs_attention. It claims no alert: only a person picking it up moves it. */
export const ON_HOLD_MESSAGE =
  "Your request needs a person to look at it, so it's waiting in our team's queue. This page updates by itself when it moves again. You can leave and come back with your reference.";

const WORKING_NOTE = 'You can leave this page. It keeps your place, and your reference brings you back.';

type TicketThreadProps = {
  description: string;
  createdAt: string;
  support: SupportSide;
  /** The landing-page sample: no live region, no "closed" footer, a generic author caption. */
  demo?: boolean;
};

// The thread sits on the form's own ground: the customer's text and the reply are tinted
// panels whose ply colour only rules the edge, then whatever the office has to say.
export function TicketThread({ description, createdAt, support, demo = false }: TicketThreadProps) {
  const [expanded, setExpanded] = useState(false);
  const counts = useStampOnChange({ support: support.kind });
  const stamp = stampProps(counts, 'support');
  const long = description.length > 140 || description.split('\n').length > 4;

  return (
    <div className="flex min-h-62.5 flex-col gap-3 px-5.5 py-5">
      <blockquote
        className={cn(
          'max-w-[86%] self-end border border-ply-received/45 bg-ply-received/6 px-4 py-3 whitespace-pre-wrap break-words text-foreground',
          !expanded && 'line-clamp-4 sm:line-clamp-none'
        )}
      >
        {description}
      </blockquote>
      {long && (
        <Button
          variant="tb"
          className="self-end sm:hidden"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Show full message'}
        </Button>
      )}
      <p className="label-caps self-end text-[0.6875rem] text-muted-foreground">You · {printedTime(createdAt)}</p>

      {/* The support side changes in place, so screen readers hear each stage and the reply. */}
      <div aria-live={demo ? undefined : 'polite'} className="flex flex-col gap-3">
        <div key={stamp.key} className={cn('flex flex-col gap-3', stamp.className)}>
          <SupportMessage support={support} demo={demo} print={demo && stamp.className !== undefined} />
        </div>
      </div>
    </div>
  );
}

type SupportMessageProps = {
  support: SupportSide;
  demo: boolean;
  /** The reply landed while the sample played, so it prints in rather than stamping whole. */
  print: boolean;
};

function SupportMessage({ support, demo, print }: SupportMessageProps) {
  if (support.kind === 'working') {
    return (
      <>
        {demo && support.badges && <TriageBadgeList badges={support.badges} />}
        <div className="border border-dashed border-ply-live-ink/55 px-4 py-3 text-muted-foreground">
          <p role="status" className="label-caps text-xs text-ply-live-ink">
            {support.stage === 'reviewing' ? 'Reading your request...' : 'Writing a reply...'}
          </p>
          {WORKING_NOTE}
        </div>
      </>
    );
  }

  if (support.kind === 'on-hold') {
    return (
      <div className="border border-foreground bg-ply-on-hold px-4 py-3 text-ply-on-hold-foreground">
        <p className="label-caps text-xs">On hold</p>
        {ON_HOLD_MESSAGE}
      </div>
    );
  }

  return (
    <>
      {demo && support.badges && <TriageBadgeList badges={support.badges} />}
      <div className="border border-ply-replied-edge bg-ply-replied/28 px-4 py-3 whitespace-pre-wrap break-words text-foreground">
        {print ? <PrintedText text={support.reply} /> : support.reply}
      </div>
      <p className="label-caps text-[0.6875rem] text-muted-foreground">
        Reply from support{support.repliedAt ? ` · ${printedTime(support.repliedAt)}` : ''}
      </p>
    </>
  );
}

// The paper is already on the form; the ink lands one line at a time. The line count is
// measured before paint, so the steps match the lines at any width.
function PrintedText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [lines, setLines] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
    setLines(Math.max(1, Math.round(el.getBoundingClientRect().height / lineHeight)));
  }, []);

  return (
    <span
      ref={ref}
      className={cn('block', lines !== null && 'animate-print')}
      style={lines !== null ? ({ '--lines': lines } as CSSProperties) : undefined}
    >
      {text}
    </span>
  );
}

// Only the landing sample shows badges inline; the real page stamps them in Office use.
function TriageBadgeList({ badges }: { badges: TriageBadges }) {
  const category = toneForCategory(badges.category);
  const priority = toneForPriority(badges.priority);
  return (
    <ul aria-label="Triage" className="flex flex-wrap gap-2">
      {category && (
        <li>
          <ToneChip tone={category}>
            <span className="sr-only">Category: </span>
            {humanize(badges.category)}
          </ToneChip>
        </li>
      )}
      {priority && (
        <li>
          <ToneChip tone={priority}>
            <span className="sr-only">Priority: </span>
            {humanize(badges.priority)} priority
          </ToneChip>
        </li>
      )}
    </ul>
  );
}
