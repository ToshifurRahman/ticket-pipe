import { cn } from '@/lib/utils';

export type Tone = 'billing' | 'account' | 'bug' | 'tech' | 'feature' | 'low' | 'medium' | 'high' | 'urgent';

// Tailwind only sees whole class names, so each tone spells its colours out.
const OUTLINE: Record<Tone, string> = {
  billing: 'border-topic-billing text-topic-billing',
  account: 'border-topic-account text-topic-account',
  bug: 'border-topic-bug text-topic-bug',
  tech: 'border-topic-tech text-topic-tech',
  feature: 'border-topic-feature text-topic-feature',
  low: 'border-priority-low text-priority-low',
  medium: 'border-priority-medium text-priority-medium',
  high: 'border-priority-high text-priority-high',
  urgent: 'border-priority-urgent text-priority-urgent',
};

const FILL: Record<Tone, string> = {
  billing: 'bg-topic-billing-fill',
  account: 'bg-topic-account-fill',
  bug: 'bg-topic-bug-fill',
  tech: 'bg-topic-tech-fill',
  feature: 'bg-topic-feature-fill',
  low: 'bg-priority-low-fill',
  medium: 'bg-priority-medium-fill',
  high: 'bg-priority-high-fill',
  urgent: 'bg-priority-urgent-fill',
};

/**
 * A topic or priority stamp. Outline: colour on text and rule only, for a ticket's own page.
 * Fill: a bright slab with a dark rule, for a key printed on a coloured ply.
 */
export function ToneChip({
  tone,
  variant = 'outline',
  className,
  style,
  chipRef,
  children,
}: {
  tone: Tone;
  variant?: 'outline' | 'fill';
  className?: string;
  style?: React.CSSProperties;
  chipRef?: React.Ref<HTMLSpanElement>;
  children: React.ReactNode;
}) {
  return (
    <span
      ref={chipRef}
      style={style}
      className={cn(
        'label-caps stamp-tilt inline-block border px-2 py-0.5 text-xs',
        variant === 'outline' ? OUTLINE[tone] : cn(FILL[tone], 'border-ply-triaged-foreground text-ply-triaged-foreground'),
        className
      )}
    >
      {children}
    </span>
  );
}
