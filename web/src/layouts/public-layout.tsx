import { Outlet, useMatch } from 'react-router-dom';
import { SiteFooter } from '@/components/site-footer';
import { SkipLink } from '@/components/skip-link';
import { SiteHeader } from '@/components/site-header';
import { cn } from '@/lib/utils';

// The landing page and the 404 are full-width bands; every other page sits in a centred column.
export function PublicLayout({ bare = false }: { bare?: boolean }) {
  const landing = useMatch('/') !== null || bare;
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <SiteHeader />
      <main
        id="main"
        tabIndex={-1}
        className={cn('outline-none flex-1', !landing && 'mx-auto w-full max-w-(--page-width) px-4 py-12 pb-18')}
      >
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
