import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

// A filed-away band, as the landing stages are: the strip carries the time the page was printed.
export function NotFoundPage() {
  const [printedAt] = useState(() => new Date().toLocaleTimeString('en-GB', { hour12: false }));
  return (
    <section className="px-4">
      <div className="mx-auto max-w-(--content-width) [--strip:var(--strip-narrow)] md:[--strip:var(--strip-wide)]">
        <div className="flex h-(--strip) items-center gap-4 border-b border-current">
          <span className="font-mono text-[0.8125rem]">404</span>
          <span className="label-caps text-[0.9375rem]">Not on file</span>
          <span className="ml-auto font-mono text-[0.8125rem]">{printedAt}</span>
        </div>
        <div className="grid items-start gap-8 pt-8 pb-10 md:grid-cols-[7fr_5fr] md:gap-12">
          <h1 className="mt-8 font-label text-[clamp(4rem,11vw,10.5rem)] leading-[0.85] font-bold tracking-[-0.01em] uppercase">
            Page not found
          </h1>
          <div className="leading-[1.55]">
            <span className="button-caps stamp-tilt mt-5 mb-2 inline-block border-3 border-destructive px-4 py-2 text-lg leading-[normal] text-destructive">
              No such page
            </span>
            <p className="mt-5 mb-7 max-w-[24em] text-xl leading-[1.55]">The page you are looking for does not exist.</p>
            <Button asChild variant="solid">
              <Link to="/" className="text-background no-underline hover:no-underline">
                Back to home
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
