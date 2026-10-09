import { Link, useLocation } from 'react-router-dom';
import { ThemeToggle } from '@/components/theme-toggle';
import { TrackTicketField } from '@/components/track-ticket-field';
import { Wordmark } from '@/components/brand-mark';

const LANDING_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

export function SiteHeader() {
  const { pathname } = useLocation();
  return (
    <header className="border-b bg-background/60 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" aria-label="Home" className="text-foreground no-underline hover:no-underline">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-3 sm:gap-5" aria-label="Main">
          {pathname === '/' && (
            <div className="hidden items-center gap-5 text-sm md:flex">
              {LANDING_LINKS.map((link) => (
                <a key={link.href} href={link.href} className="text-muted-foreground no-underline hover:text-foreground">
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
