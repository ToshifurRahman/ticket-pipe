import { Link } from 'react-router-dom';
import { brand } from '@/config/brand';

// The form's bottom rule: one hairline inside the page column. The legal links are printed
// chrome, underlined like the demo's.
export function SiteFooter() {
  return (
    <footer className="bg-background px-4">
      <div className="button-caps mx-auto flex max-w-(--content-width) flex-wrap items-center justify-between gap-4 border-t py-6 text-xs text-muted-foreground">
        <span>
          © {brand.name} · {brand.tagline}
        </span>
        <nav aria-label="Legal">
          <Link to="/privacy" className="text-inherit">
            Privacy
          </Link>{' '}
          ·{' '}
          <Link to="/terms" className="text-inherit">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
