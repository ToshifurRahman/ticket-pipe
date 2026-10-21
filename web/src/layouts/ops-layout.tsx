import { Outlet } from 'react-router-dom';
import { Wordmark } from '@/components/brand-mark';
import { OpsHeaderActions } from '@/components/ops/ops-header-actions';
import { SkipLink } from '@/components/skip-link';
import { Toaster } from '@/components/ui/sonner';

// No track field and no footer: this is a working surface. The feed indicator and Sign out
// appear once someone is signed in.
export function OpsLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 w-full max-w-(--page-width) items-center gap-4 px-4">
          <Wordmark />
          <span className="button-caps stamp-tilt border-2 border-ply-drafted px-2 py-0.5 text-xs text-ply-drafted">
            Ops
          </span>
          <div className="ml-auto flex items-center gap-3.5">
            <OpsHeaderActions />
          </div>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-(--page-width) flex-1 px-4 pt-8 pb-18 outline-none"
      >
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
