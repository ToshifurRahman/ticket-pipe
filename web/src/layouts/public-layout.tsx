import { Outlet, useMatch } from 'react-router-dom';
import { SiteFooter } from '@/components/site-footer';
import { SkipLink } from '@/components/skip-link';
import { SiteHeader } from '@/components/site-header';
import { cn } from '@/lib/utils';

// The landing page is a stack of full-width bands; every other page sits in a centred column.
export function PublicLayout() {
  const landing = useMatch('/') !== null;
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <SiteHeader />
      <main
        id="main"
        tabIndex={-1}
        className={cn('outline-none flex-1', !landing && 'mx-auto w-full max-w-6xl px-4 py-10 sm:px-6')}
      >
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
