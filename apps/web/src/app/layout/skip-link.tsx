// First tab stop on every page: lets keyboard users jump past the header to the content.
// Hidden until focused, then an ink tile with the global focus outline. The target is the
// layout's <main id="main">.
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-primary focus:px-4 focus:py-2 focus:label-caps focus:text-sm focus:text-primary-foreground focus:no-underline"
    >
      Skip to content
    </a>
  );
}
