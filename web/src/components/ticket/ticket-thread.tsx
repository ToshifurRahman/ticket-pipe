import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { relativeTime } from '@/lib/relative-time';
import { humanize, type SupportSide, type TriageBadges } from '@/lib/ticket-thread';
import { cn } from '@/lib/utils';

export const WITH_TEAM_MESSAGE =
  'Your request needs a closer look. Our team has been notified and will follow up here.';

type TicketThreadProps = {
  description: string;
  createdAt: string;
  support: SupportSide;
  /** The landing-page sample: no live region, no "closed" footer, a generic author caption. */
  demo?: boolean;
};

// A read-only conversation: the customer's message, then whatever support has to say.
export function TicketThread({ description, createdAt, support, demo = false }: TicketThreadProps) {
  return (
    <div className="flex flex-col gap-6">
      <figure className="flex flex-col items-end gap-1.5">
        <blockquote className="max-w-[min(100%,40rem)] rounded-2xl rounded-br-md bg-foreground px-4 py-3 whitespace-pre-wrap break-words text-background">
          {description}
        </blockquote>
        <figcaption className="text-xs text-muted-foreground">{demo ? 'Customer' : `You · ${relativeTime(createdAt)}`}</figcaption>
      </figure>

      {/* The support side changes in place, so screen readers hear each stage and the reply. */}
      <div aria-live={demo ? undefined : 'polite'} className="flex flex-col gap-6">
        <SupportMessage support={support} />
      </div>

      {support.kind === 'replied' && !demo && (
        <footer className="flex flex-col items-center gap-3 border-t border-border pt-6 text-center">
          <p className="text-sm text-muted-foreground">
            This conversation is closed. Need more help? Open a new ticket.
          </p>
          <Button asChild variant="outline">
            <Link to="/new" className="no-underline">
              Open a new ticket <ArrowRight />
            </Link>
          </Button>
        </footer>
      )}
    </div>
  );
}

function SupportMessage({ support }: { support: SupportSide }) {
  if (support.kind === 'working') {
    return (
      <SupportRow badges={support.badges}>
        <div
          role="status"
          className="inline-flex items-center gap-3 rounded-full border border-border bg-card/70 px-4 py-2 text-sm"
        >
          <TypingDots />
          {support.stage === 'reviewing' ? 'Reviewing your request…' : 'Writing a reply…'}
        </div>
      </SupportRow>
    );
  }

  if (support.kind === 'with-team') {
    return (
      <SupportRow caption="Support">
        <Bubble>{WITH_TEAM_MESSAGE}</Bubble>
      </SupportRow>
    );
  }

  return (
    <SupportRow
      badges={support.badges}
      caption={`Reply from support${support.repliedAt ? ` · ${relativeTime(support.repliedAt)}` : ''}`}
    >
      <Bubble>{support.reply}</Bubble>
    </SupportRow>
  );
}

function SupportRow({
  badges,
  caption,
  children,
}: {
  badges?: TriageBadges | null;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <BrandMark className="size-8 shrink-0" />
      <div className="flex min-w-0 flex-col items-start gap-2">
        {badges && <TriageBadgeList badges={badges} />}
        {children}
        {caption && <span className="text-xs text-muted-foreground">{caption}</span>}
      </div>
    </div>
  );
}

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[min(100%,40rem)] rounded-2xl rounded-tl-md border border-border bg-card/80 px-4 py-3 whitespace-pre-wrap break-words">
      {children}
    </div>
  );
}

const URGENT = new Set(['high', 'critical']);

function TriageBadgeList({ badges }: { badges: TriageBadges }) {
  return (
    <ul aria-label="Triage" className="flex flex-wrap gap-2">
      <li className="rounded-full border border-border bg-card/70 px-2.5 py-0.5 text-xs font-medium">
        <span className="sr-only">Category: </span>
        {humanize(badges.category)}
      </li>
      <li
        className={cn(
          'rounded-full border px-2.5 py-0.5 text-xs font-medium',
          URGENT.has(badges.priority) ? 'border-warning/40 text-warning' : 'border-border text-muted-foreground'
        )}
      >
        <span className="sr-only">Priority: </span>
        {humanize(badges.priority)} priority
      </li>
    </ul>
  );
}

function TypingDots() {
  return (
    <span aria-hidden className="flex gap-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-bounce rounded-full bg-primary/70"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
