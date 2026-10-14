// First tab stop on every page: lets keyboard users jump past the header to the content.
// Hidden until focused. The target is the layout's <main id="main">.
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
    >
      Skip to content
    </a>
  );
}
