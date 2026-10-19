import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PRICING_HEADING, TIERS, type Tier } from '@/content/landing';
import { cn } from '@/lib/utils';
import { useStampOnView } from './use-stamp-on-view';

export function Pricing() {
  return (
    <section id="rates" aria-labelledby="pricing-title" className="scroll-mt-24">
      <h2 id="pricing-title" className="mb-8 text-center text-[clamp(2rem,4.4vw,3.5rem)] leading-none font-bold tracking-[-0.03em] text-balance">
        {PRICING_HEADING.title}
      </h2>
      <ul className="ruled grid divide-y divide-rule md:grid-cols-3 md:divide-x md:divide-y-0">
        {TIERS.map((tier, i) => (
          <TierCard key={tier.name} tier={tier} index={i} />
        ))}
      </ul>
    </section>
  );
}

// The tiers sweep in left to right, a step apart. The featured one is the green slab.
function TierCard({ tier, index }: { tier: Tier; index: number }) {
  const { ref, className, style } = useStampOnView<HTMLLIElement>({ threshold: 0.3, animation: 'animate-sweep', delayMs: index * 135 });
  return (
    <li
      ref={ref}
      style={style}
      className={cn('flex min-w-0 flex-col gap-4 p-7', tier.featured && 'on-hero', className)}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="label-caps text-base">{tier.name}</h3>
        {tier.featured && <PopularStamp />}
      </div>
      <p className="flex items-baseline gap-1">
        <span className="font-mono text-4xl tracking-tight">{tier.price}</span>
        {tier.cadence && <span className="font-mono text-sm opacity-80">{tier.cadence}</span>}
      </p>
      <p className={tier.featured ? 'opacity-85' : 'text-muted-foreground'}>{tier.blurb}</p>
      <ul className="flex flex-col gap-1.5 text-sm">
        {tier.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <Button asChild variant={tier.featured ? 'default' : 'outline'} className="mt-auto h-12">
        <Link to="/new" className="no-underline hover:no-underline">
          {tier.cta}
        </Link>
      </Button>
    </li>
  );
}

// Inked on the featured tier like an office stamp, a little askew, after the tier has swept in.
function PopularStamp() {
  const { ref, className: stampClass, style } = useStampOnView<HTMLParagraphElement>({ delayMs: 400 });
  return (
    <p
      ref={ref}
      style={style}
      className={cn('label-caps stamp-tilt shrink-0 border-(length:--rule-width) border-current px-2 py-0.5 text-xs', stampClass)}
    >
      Popular
    </p>
  );
}
