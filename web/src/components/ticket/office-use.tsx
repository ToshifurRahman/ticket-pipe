import { printedTime } from '@/lib/relative-time';
import { humanize, onHoldTime, type Ply, type TriageBadges } from '@/lib/ticket-thread';
import type { TicketDetail } from '@/lib/types';
import { cn } from '@/lib/utils';
import { NotifyCard } from './notify-card';
import { stampProps, useStampOnChange } from './use-stamp-on-change';

const TIME_LABELS: Record<Ply['key'], string> = {
  received: 'Received',
  triage: 'Triaged',
  draft: 'Drafted',
  reply: 'Replied',
};

// The form's side column: what the office stamped on the ticket and when, then the email
// opt-in. Every priority is stamped in grey; red stamps belong to the ops console.
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
  const held = onHoldTime(ticket);

  return (
    <aside aria-label="Office use" className="flex flex-col gap-6">
      <h2 className="label-caps text-sm text-muted-foreground">Office use</h2>

      <ul aria-label="Triage" className="flex flex-wrap gap-3">
        <Stamp id="category" counts={counts} label="Category" value={badges ? humanize(badges.category) : null} />
        <Stamp
          id="priority"
          counts={counts}
          label="Priority"
          value={badges ? `${humanize(badges.priority)} priority` : null}
        />
      </ul>

      <dl className="flex flex-col">
        {plies.map((ply) => (
          <TimeRow key={ply.key} label={TIME_LABELS[ply.key]} time={ply.time} />
        ))}
        {held && <TimeRow label="On hold" time={held} />}
      </dl>

      <NotifyCard ticketId={ticket.id} />
    </aside>
  );
}

function Stamp({
  id,
  counts,
  label,
  value,
}: {
  id: 'category' | 'priority';
  counts: Record<string, number>;
  label: string;
  value: string | null;
}) {
  const stamp = stampProps(counts, id);
  return (
    <li
      key={stamp.key}
      className={cn(
        'ruled label-caps -rotate-2 px-3 py-1.5 text-sm',
        value ? 'text-foreground' : 'text-muted-foreground',
        stamp.className
      )}
    >
      <span className="sr-only">{label}: </span>
      {value ?? '-'}
    </li>
  );
}

function TimeRow({ label, time }: { label: string; time: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule py-2 last:border-b-0">
      <dt className="label-caps text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xs">{time ? printedTime(time) : '-'}</dd>
    </div>
  );
}
