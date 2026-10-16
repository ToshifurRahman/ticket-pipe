import { Outlet } from 'react-router-dom';
import { SiteFooter } from '@/components/site-footer';
import { SkipLink } from '@/components/skip-link';
import { SiteHeader } from '@/components/site-header';

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="outline-none mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
