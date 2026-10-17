import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { printedTime } from '@/lib/relative-time';
import { humanize, type SupportSide, type TriageBadges } from '@/lib/ticket-thread';
import { cn } from '@/lib/utils';
import { stampProps, useStampOnChange } from './use-stamp-on-change';

/** Shown when failed or needs_attention. It claims no alert: only a person picking it up moves it. */
export const ON_HOLD_MESSAGE =
  'Your request needs a person to look at it, so it’s waiting in our team’s queue. This page updates by itself when it moves again. You can leave and come back with your reference.';
const ON_HOLD_WITH_EMAIL = ON_HOLD_MESSAGE.replace(/ reference\.$/, ' reference, or get an email when it changes.');

const WORKING_NOTE = 'You can leave this page. It keeps your place, and your reference brings you back.';
const WORKING_NOTE_WITH_EMAIL =
  'You can leave this page. It keeps your place, and your reference brings you back, or get an email when it’s ready.';

type TicketThreadProps = {
  description: string;
  createdAt: string;
  support: SupportSide;
  /** The API says an email can be offered, so the working and on-hold notes mention it. */
  emailOffered?: boolean;
  /** The landing-page sample: no live region, no "closed" footer, a generic author caption. */
  demo?: boolean;
};

// The thread sits on the form: the customer's text on the white ply, then whatever the
// office has to say, each on its own ply.
export function TicketThread({ description, createdAt, support, emailOffered = false, demo = false }: TicketThreadProps) {
  const [expanded, setExpanded] = useState(false);
  const counts = useStampOnChange({ support: support.kind });
  const stamp = stampProps(counts, 'support');
  const long = description.length > 140 || description.split('\n').length > 4;

  return (
    <div className="flex flex-col gap-6">
      <figure className="flex flex-col items-end gap-1.5">
        <blockquote
          className={cn(
            'ruled max-w-[min(100%,40rem)] bg-ply-received px-4 py-3 whitespace-pre-wrap break-words text-ply-received-foreground',
            !expanded && 'line-clamp-4 sm:line-clamp-none'
          )}
        >
          {description}
        </blockquote>
        {long && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs sm:hidden"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Show less' : 'Show full message'}
          </Button>
        )}
        <figcaption className="label-caps text-xs text-muted-foreground">
          {demo ? 'Customer' : `You · ${printedTime(createdAt)}`}
        </figcaption>
      </figure>

      {/* The support side changes in place, so screen readers hear each stage and the reply. */}
      <div aria-live={demo ? undefined : 'polite'} className="flex flex-col gap-6">
        <div key={stamp.key} className={stamp.className}>
          <SupportMessage support={support} emailOffered={emailOffered} demo={demo} />
        </div>
      </div>

      {support.kind === 'replied' && !demo && (
        <footer className="flex flex-col items-start gap-3 border-t border-rule pt-6">
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

function SupportMessage({ support, emailOffered, demo }: { support: SupportSide; emailOffered: boolean; demo: boolean }) {
  if (support.kind === 'working') {
    return (
      <div className="flex flex-col gap-3">
        {demo && support.badges && <TriageBadgeList badges={support.badges} />}
        <div className="flex flex-col gap-2 border border-dashed border-ply-live p-4">
          <p role="status" className="label-caps text-sm text-ply-live">
            {support.stage === 'reviewing' ? 'Reviewing your request…' : 'Writing a reply…'}
          </p>
          <p className="text-sm text-muted-foreground">{emailOffered ? WORKING_NOTE_WITH_EMAIL : WORKING_NOTE}</p>
        </div>
      </div>
    );
  }

  if (support.kind === 'on-hold') {
    return (
      <div className="ruled flex flex-col gap-2 bg-ply-on-hold p-4 text-ply-on-hold-foreground">
        <p className="label-caps text-sm">On hold</p>
        <p>{emailOffered ? ON_HOLD_WITH_EMAIL : ON_HOLD_MESSAGE}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {demo && support.badges && <TriageBadgeList badges={support.badges} />}
      <div className="ruled bg-ply-replied px-4 py-3 whitespace-pre-wrap break-words text-ply-replied-foreground">
        {support.reply}
      </div>
      <span className="label-caps text-xs text-muted-foreground">
        Reply from support{support.repliedAt ? ` · ${printedTime(support.repliedAt)}` : ''}
      </span>
    </div>
  );
}

// Only the landing sample shows badges inline; the real page stamps them in Office use.
function TriageBadgeList({ badges }: { badges: TriageBadges }) {
  return (
    <ul aria-label="Triage" className="flex flex-wrap gap-2">
      <li className="ruled label-caps px-2 py-0.5 text-xs">
        <span className="sr-only">Category: </span>
        {humanize(badges.category)}
      </li>
      <li className="ruled label-caps px-2 py-0.5 text-xs text-muted-foreground">
        <span className="sr-only">Priority: </span>
        {humanize(badges.priority)} priority
      </li>
    </ul>
  );
}
