import { Link } from 'react-router-dom';
import { brand } from '@/config/brand';

export function SiteFooter() {
  return (
    <footer className="border-t bg-background/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
        <span>
          © {brand.name} · {brand.footer}
        </span>
        <nav className="flex gap-5" aria-label="Legal">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
