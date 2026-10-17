import type { Ply, PlyState } from '@/lib/ticket-thread';
import { printedTime } from '@/lib/relative-time';
import { cn } from '@/lib/utils';
import { stampProps, useStampOnChange } from './use-stamp-on-change';

const SURFACE: Record<Ply['key'], string> = {
  received: 'bg-ply-received text-ply-received-foreground',
  triage: 'bg-ply-triaged text-ply-triaged-foreground',
  draft: 'bg-ply-triaged text-ply-triaged-foreground',
  reply: 'bg-ply-replied text-ply-replied-foreground',
};

const STATE_SURFACE: Partial<Record<PlyState, string>> = {
  live: 'bg-ply-live text-ply-live-foreground',
  'on-hold': 'bg-ply-on-hold text-ply-on-hold-foreground',
  waiting: 'bg-background text-muted-foreground',
};

const STATE_TEXT: Record<PlyState, string> = {
  done: '',
  live: 'in progress',
  waiting: '-',
  'on-hold': 'on hold',
};

const SR_STATE: Record<PlyState, string> = {
  done: 'done',
  live: 'in progress',
  waiting: 'waiting',
  'on-hold': 'on hold',
};

/**
 * The four plies of the form: number, caps label and the printed time. A ply that changes
 * state after the page loaded is stamped in; nothing else on the row moves.
 */
export function PlyRow({ plies }: { plies: Ply[] }) {
  const counts = useStampOnChange(Object.fromEntries(plies.map((p) => [p.key, p.state])));

  return (
    <ol aria-label="Progress" className="ruled grid grid-cols-4">
      {plies.map((ply) => {
        const stamp = stampProps(counts, ply.key);
        return (
          <li
            key={stamp.key}
            data-state={ply.state}
            aria-current={ply.state === 'live' ? 'step' : undefined}
            className={cn(
              'flex min-w-0 flex-col gap-1 px-2 py-3 sm:gap-2 sm:px-4 sm:py-4',
              ply.n > 1 && 'border-l border-rule',
              STATE_SURFACE[ply.state] ?? SURFACE[ply.key],
              stamp.className
            )}
          >
            <span aria-hidden className="font-mono text-xs">
              {ply.n}
            </span>
            <span
              className={cn(
                'label-caps text-xs break-words sm:text-sm',
                ply.state === 'on-hold' && 'line-through decoration-2'
              )}
            >
              {ply.label}
              <span className="sr-only">
                {`, stage ${ply.n}, ${SR_STATE[ply.state]}`}
              </span>
            </span>
            <span className="font-mono text-xs">
              {ply.time ? printedTime(ply.time) : STATE_TEXT[ply.state]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
