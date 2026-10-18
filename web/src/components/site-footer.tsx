import { Link } from 'react-router-dom';
import { brand } from '@/config/brand';

// The form's bottom rule. The legal links are printed chrome, styled like the header nav.
export function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-muted-foreground sm:px-6">
        <span className="label-caps text-xs">
          © {brand.name} · {brand.tagline}
        </span>
        <nav className="flex gap-5" aria-label="Legal">
          <Link to="/privacy" className="label-caps text-xs text-muted-foreground no-underline hover:text-foreground">
            Privacy
          </Link>
          <Link to="/terms" className="label-caps text-xs text-muted-foreground no-underline hover:text-foreground">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
