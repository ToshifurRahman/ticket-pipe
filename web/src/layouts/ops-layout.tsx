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
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Wordmark />
            <span className="border border-input px-2 py-0.5 label-caps text-xs text-muted-foreground">Ops</span>
          </div>
          <div className="flex items-center gap-3">
            <OpsHeaderActions />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="outline-none mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
