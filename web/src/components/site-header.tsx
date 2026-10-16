import { Link, useLocation } from 'react-router-dom';
import { ThemeToggle } from '@/components/theme-toggle';
import { TrackTicketField } from '@/components/track-ticket-field';
import { Wordmark } from '@/components/brand-mark';

const LANDING_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

// The form's top rule: mark, sections, Track field, theme. Flat ground, one hairline under it.
export function SiteHeader() {
  const { pathname } = useLocation();
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" aria-label="Home" className="text-foreground no-underline">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-3 sm:gap-5" aria-label="Main">
          {pathname === '/' && (
            <div className="hidden items-center gap-5 md:flex">
              {LANDING_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="label-caps text-sm text-muted-foreground no-underline hover:text-foreground"
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}
          <TrackTicketField />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
