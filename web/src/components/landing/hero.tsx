import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { brand } from '@/config/brand';
import { DemoTicket } from './demo-ticket';

export function Hero() {
  return (
    <section className="grid items-start gap-10 py-6 lg:grid-cols-12 lg:gap-12 lg:py-12">
      <div className="flex flex-col items-start gap-6 lg:col-span-5">
        <span className="label-caps text-xs text-muted-foreground">{brand.tagline}</span>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{brand.headline}</h1>
        <p className="max-w-xl text-lg text-muted-foreground">{brand.subline}</p>
        <Button asChild className="h-11 w-full sm:w-auto">
          <Link to="/new" className="no-underline hover:no-underline">
            Submit a ticket
          </Link>
        </Button>
      </div>
      <div className="lg:col-span-7">
        <DemoTicket />
      </div>
    </section>
  );
}
