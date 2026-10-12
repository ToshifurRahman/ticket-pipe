import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TrackForm } from '@/components/track-ticket-field';
import { Button } from '@/components/ui/button';
import { brand } from '@/config/brand';
import { DemoTicket } from './demo-ticket';

export function Hero() {
  return (
    <section className="grid items-center gap-10 py-6 lg:grid-cols-2 lg:gap-12 lg:py-12">
      <div className="flex flex-col items-start gap-6">
        <span className="rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
          {brand.tagline}
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{brand.headline}</h1>
        <p className="max-w-xl text-lg text-muted-foreground">{brand.subline}</p>
        <div className="flex w-full max-w-md flex-col gap-3">
          <Button asChild size="default" className="h-11 w-full sm:w-auto sm:self-start">
            <Link to="/new" className="no-underline hover:no-underline">
              Submit a ticket <ArrowRight />
            </Link>
          </Button>
          <TrackForm />
        </div>
      </div>
      <DemoTicket />
    </section>
  );
}
