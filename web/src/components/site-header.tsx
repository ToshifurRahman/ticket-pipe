import { Link, useLocation } from 'react-router-dom';
import { TrackTicketField } from '@/components/track-ticket-field';
import { Wordmark } from '@/components/brand-mark';

const LANDING_LINKS = [
  { href: '#stages', label: 'How it works' },
  { href: '#rates', label: 'Rates' },
  { href: '#faq', label: 'Questions' },
];

// The form's top rule: mark, sections, Track field. Flat ground, one hairline under it.
export function SiteHeader() {
  const { pathname } = useLocation();
  return (
    <header className="on-hero">
      <div className="mx-auto flex h-16 max-w-(--page-width) items-center justify-between gap-4 px-4">
        <Link to="/" aria-label="Home" className="text-foreground no-underline hover:no-underline">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-6" aria-label="Main">
          {pathname === '/' && (
            <div className="hidden items-center gap-6 md:flex">
              {LANDING_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="button-caps text-[0.8125rem] text-foreground no-underline hover:no-underline"
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}
          <TrackTicketField />
        </nav>
      </div>
    </header>
  );
}
