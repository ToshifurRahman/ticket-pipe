import { FEATURES, FEATURES_HEADING } from '@/content/landing';
import { printedTime } from '@/lib/relative-time';
import { cn } from '@/lib/utils';
import { ToneChip, type Tone } from '@/components/ticket/tone-chip';
import { DEMO_TIMES } from './demo-script';
import { useStampOnView } from './use-stamp-on-view';
import { Stamp } from '@/components/form/stamp';

const TOPICS: [Tone, string][] = [
  ['billing', 'Billing'],
  ['account', 'Account'],
  ['bug', 'Bug'],
  ['tech', 'Technical'],
  ['feature', 'Feature'],
];
const PRIORITIES: [Tone, string][] = [
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
  ['urgent', 'Urgent'],
];

// Each band is one ply of the form: its colour is the ply's, and its top strip sticks, so
// scrolling stacks the plies the way a ticket moves through them.
const BAND: string[] = [
  'bg-ply-received text-ply-received-foreground',
  'bg-ply-triaged text-ply-triaged-foreground',
  'bg-ply-drafted text-ply-drafted-foreground',
  'bg-ply-replied text-ply-replied-foreground',
];
const STICK = ['top-0', 'top-(--strip)', 'top-[calc(var(--strip)*2)]', 'top-[calc(var(--strip)*3)]'];

export function Stages() {
  return (
    <section id="stages" aria-labelledby="stages-title">
      <h2 id="stages-title" className="sr-only">
        {FEATURES_HEADING.title}
      </h2>
      <ol className="relative [--strip:var(--strip-narrow)] md:[--strip:var(--strip-wide)]">
        {FEATURES.map(({ n, label, body }, i) => (
          <li
            key={n}
            className={cn('sticky min-h-75 px-4 shadow-[0_-14px_18px_-14px_rgb(0_0_0/0.35)] md:min-h-85', BAND[i], STICK[i])}
          >
            <div className="mx-auto max-w-(--content-width)">
              <div className="flex h-(--strip) items-center gap-4 border-b border-current">
                <span aria-hidden className="font-mono text-meta">
                  {i + 1}
                </span>
                <span aria-hidden className="label-caps text-[0.9375rem]">
                  {label}
                </span>
                <span className="ml-auto font-mono text-meta">{printedTime(DEMO_TIMES[i])}</span>
              </div>
              <div className="grid items-end gap-8 pt-8 pb-10 md:grid-cols-[7fr_5fr] md:gap-12">
                <h3 className="font-label text-[clamp(4rem,11vw,10.5rem)] leading-[0.85] font-bold tracking-[-0.01em] uppercase">{label}</h3>
                <div className="flex flex-col items-start gap-5">
                  <p className="max-w-[24em] text-xl">{body}</p>
                  {i === 1 ? <Legend /> : <StageStamp text={i === 0 ? `Filed ${printedTime(DEMO_TIMES[0])}` : i === 2 ? 'Reply ready' : 'Sent to thread'} />}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StageStamp({ text }: { text: string }) {
  const { ref, className, style } = useStampOnView<HTMLSpanElement>();
  return (
    <Stamp
      ref={ref}
      style={style}
      className={cn('border-(length:--rule-width) border-current px-3 py-1.5 text-meta', className)}
    >
      {text}
    </Stamp>
  );
}

// The key to the colours, printed straight on the Triaged ply.
function Legend() {
  return (
    <div className="flex flex-col gap-3">
      <ChipRow label="Topic" chips={TOPICS} offset={0} />
      <ChipRow label="Priority" chips={PRIORITIES} offset={TOPICS.length} />
    </div>
  );
}

function ChipRow({ label, chips, offset }: { label: string; chips: [Tone, string][]; offset: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="button-caps w-full text-caption sm:w-18">{label}</span>
      {chips.map(([tone, text], i) => (
        <LegendChip key={tone} tone={tone} delayMs={(offset + i) * 90}>
          {text}
        </LegendChip>
      ))}
    </div>
  );
}

function LegendChip({ tone, delayMs, children }: { tone: Tone; delayMs: number; children: string }) {
  const { ref, className, style } = useStampOnView<HTMLSpanElement>({ delayMs });
  return (
    <ToneChip tone={tone} variant="fill" chipRef={ref} style={style} className={className}>
      {children}
    </ToneChip>
  );
}
