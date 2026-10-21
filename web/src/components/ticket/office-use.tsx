import { printedTime } from '@/lib/relative-time';
import { humanize, type Ply, type TriageBadges } from '@/lib/ticket-thread';
import type { TicketDetail } from '@/lib/types';
import { cn } from '@/lib/utils';
import { NotifyCard } from './notify-card';
import { ToneChip, toneForCategory, toneForPriority, type Tone } from './tone-chip';
import { stampProps, useStampOnChange } from './use-stamp-on-change';
import { Stamp } from '@/components/form/stamp';

const TIME_LABELS: Record<Ply['key'], string> = {
  received: 'Received',
  triage: 'Triaged',
  draft: 'Drafted',
  reply: 'Replied',
};

// The form's side column: what the office stamped on the ticket and when, then the email
// opt-in. The triage stamps wear the same topic and priority colours as the ops console.
export function OfficeUse({
  ticket,
  plies,
  badges,
}: {
  ticket: TicketDetail;
  plies: Ply[];
  badges: TriageBadges | null;
}) {
  const counts = useStampOnChange({ category: badges?.category ?? '', priority: badges?.priority ?? '' });

  return (
    <aside aria-label="Office use" className="flex flex-col gap-5.5">
      <h2 className="label-caps text-sm text-muted-foreground">Office use</h2>

      <ul aria-label="Triage" className="flex flex-wrap gap-3">
        <OfficeStamp
          id="category"
          counts={counts}
          label="Category"
          value={badges ? humanize(badges.category) : null}
          tone={badges ? toneForCategory(badges.category) : null}
        />
        <OfficeStamp
          id="priority"
          counts={counts}
          label="Priority"
          value={badges ? `${humanize(badges.priority)} priority` : null}
          tone={badges ? toneForPriority(badges.priority) : null}
        />
      </ul>

      <dl className="flex flex-col">
        {plies.map((ply) => (
          <TimeRow key={ply.key} label={ply.state === 'on-hold' ? 'On hold' : TIME_LABELS[ply.key]} time={ply.time} />
        ))}
      </dl>

      <NotifyCard ticketId={ticket.id} />
    </aside>
  );
}

function OfficeStamp({
  id,
  counts,
  label,
  value,
  tone,
}: {
  id: 'category' | 'priority';
  counts: Record<string, number>;
  label: string;
  value: string | null;
  tone: Tone | null;
}) {
  const stamp = stampProps(counts, id);
  const text = (
    <>
      <span className="sr-only">{label}: </span>
      {value ?? '-'}
    </>
  );
  return (
    <li key={stamp.key} className={stamp.className}>
      {value && tone ? (
        <ToneChip tone={tone} className="border-2 px-3 py-1.5 text-meta">
          {text}
        </ToneChip>
      ) : (
        <Stamp
          caps="label"
          className={cn(
            'border px-3 py-1.5 text-meta',
            value ? 'border-input text-foreground' : 'border-rule text-muted-foreground'
          )}
        >
          {text}
        </Stamp>
      )}
    </li>
  );
}

function TimeRow({ label, time }: { label: string; time: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule py-2 last:border-b-0">
      <dt className="label-caps text-caption text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xs">{time ? printedTime(time) : '-'}</dd>
    </div>
  );
}
