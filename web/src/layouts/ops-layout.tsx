import { Outlet } from 'react-router-dom';
import { Wordmark } from '@/components/brand-mark';
import { ThemeToggle } from '@/components/theme-toggle';

// No track field and no footer: this is a working surface. The live-feed indicator and
// Sign out arrive with the ops console (6.5 / 6.6).
export function OpsLayout() {
  return (
    <div className="space flex min-h-screen flex-col">
      <header className="border-b bg-background/60 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Wordmark />
            <span className="rounded-md border px-2 py-0.5 font-mono text-xs text-muted-foreground">ops</span>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
