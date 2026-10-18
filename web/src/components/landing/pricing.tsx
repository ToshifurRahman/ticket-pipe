import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PRICING_HEADING, TIERS } from '@/content/landing';

export function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-24 py-16">
      <div className="mb-10 flex flex-col gap-2">
        <span className="label-caps text-xs text-muted-foreground">{PRICING_HEADING.label}</span>
        <h2 id="pricing-title" className="text-3xl font-semibold tracking-tight">
          {PRICING_HEADING.title}
        </h2>
      </div>
      <ul className="ruled grid divide-y divide-rule md:grid-cols-3 md:divide-x md:divide-y-0">
        {TIERS.map((tier) => (
          <li key={tier.name} className="flex flex-col gap-5 p-6">
            <div className="flex flex-col gap-1">
              <h3 className="label-caps text-base">{tier.name}</h3>
              <p className="text-sm text-muted-foreground">{tier.blurb}</p>
            </div>
            <p className="flex items-baseline gap-1">
              <span className="font-mono text-4xl tracking-tight">{tier.price}</span>
              {tier.cadence && <span className="font-mono text-sm text-muted-foreground">{tier.cadence}</span>}
            </p>
            <ul className="flex flex-1 flex-col gap-2 text-sm text-muted-foreground">
              {tier.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <span aria-hidden className="font-mono">
                    -
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
            <Button asChild variant={tier.featured ? 'default' : 'outline'}>
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
