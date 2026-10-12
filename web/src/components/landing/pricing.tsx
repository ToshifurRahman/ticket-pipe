import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PRICING_NOTE, TIERS } from '@/content/landing';
import { cn } from '@/lib/utils';

export function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-24 py-16">
      <div className="mb-10 flex flex-col gap-2">
        <h2 id="pricing-title" className="text-3xl font-semibold tracking-tight">
          Simple pricing
        </h2>
        <p className="text-muted-foreground">{PRICING_NOTE}</p>
      </div>
      <ul className="grid gap-4 md:grid-cols-3">
        {TIERS.map((tier) => (
          <li
            key={tier.name}
            className={cn(
              'flex flex-col gap-5 rounded-xl border bg-card/70 p-6',
              tier.popular ? 'border-primary ring-1 ring-primary/50' : 'border-border'
            )}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{tier.name}</h3>
                {tier.popular && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    Popular
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{tier.blurb}</p>
            </div>
            <p className="flex items-baseline gap-1">
              <span className="text-4xl font-semibold tracking-tight">{tier.price}</span>
              {tier.cadence && <span className="text-sm text-muted-foreground">{tier.cadence}</span>}
            </p>
            <ul className="flex flex-1 flex-col gap-2 text-sm">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  {feature}
                </li>
              ))}
            </ul>
            <Button asChild variant={tier.popular ? 'default' : 'outline'}>
              <Link to="/new" className="no-underline hover:no-underline">
                {tier.cta}
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
