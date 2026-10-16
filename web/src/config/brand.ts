// The single place for the product's name and public copy. "Relay" is the final name; the
// repo / README / Render service are renamed at go-live (story 7.12). index.html's title and
// social tags are generated from this file at build time (see vite.config.ts).
export const brand = {
  name: 'Relay',
  tagline: 'AI help desk',
  headline: 'Every ticket arrives already understood.',
  subline:
    'Relay reads each request the moment it lands, sorts it by category and urgency, and drafts a reply — while your customer watches it happen.',
  // Meta description and social-card copy (also the OG image text).
  description:
    'Relay reads each support request the moment it lands, sorts it by category and urgency, and drafts a reply while your customer watches.',
  // Browser UI colour: the carbon ground (primitive.color.carbon in web/tokens/colors.json).
  // A meta tag needs a literal; tests/web-tokens.guard.test.ts keeps it equal to the token.
  themeColor: '#111111', // ds-allow-hardcode: <meta name="theme-color"> cannot read CSS variables
  footer: 'a portfolio project',
  // Where the legal pages point people who have a question. Update with the repo rename (7.12).
  repoUrl: 'https://github.com/ToshifurRahman/ticket-pipe',
} as const;
