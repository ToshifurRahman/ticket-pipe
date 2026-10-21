import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';
import { DemoTicket } from './demo-ticket';
import { useIdleNudge } from './use-idle-nudge';

// The green band: the headline prints in, then the sample form, then the button. If nobody
// has touched the page after a few seconds the button presses itself down.
export function Hero() {
  const nudge = useIdleNudge();
  return (
    <section className="bg-hero px-4 pt-10 pb-18 text-hero-foreground">
      <div className="mx-auto grid max-w-(--content-width) items-center gap-8 md:grid-cols-12 md:gap-14">
        <div className="on-hero flex flex-col items-start gap-6 md:col-span-5">
          <h1 className="animate-print-in-1 text-[clamp(2.75rem,6.4vw,5.5rem)] leading-[0.96] font-bold tracking-[-0.035em] text-balance">
            {brand.headline}
          </h1>
          <p className="max-w-[30em] text-[1.1875rem]">{brand.subline}</p>
          <Button asChild className={cn('animate-print-in-3 mt-2 w-full sm:w-auto', nudge.className)}>
            <Link to="/new" onAnimationEnd={nudge.onAnimationEnd} className="no-underline hover:no-underline">
              Submit a ticket
            </Link>
          </Button>
        </div>
        <div className="md:col-span-7">
          <DemoTicket className="animate-print-in-2" />
        </div>
      </div>
    </section>
  );
}
