// The single place for the product's name and public copy. "Relay" is the final name; the
// repo / README / Render service are renamed at go-live (story 7.12). index.html's title and
// social tags are generated from this file at build time (see vite.config.ts).
export const brand = {
  name: 'Relay',
  tagline: 'AI help desk',
  headline: 'See your ticket move.',
  subline:
    'Relay files every request as a service ticket. You see it received, triaged, drafted and replied, each stage stamped as it happens, on one page you can come back to.',
  // Meta description and social-card copy (also the OG image text).
  description:
    'Relay files every support request as a service ticket you can watch: received, triaged, drafted and replied, each stage stamped as it happens.',
  // Browser UI colour: the carbon ground (primitive.color.carbon in web/tokens/colors.json).
  // A meta tag needs a literal; tests/web-tokens.guard.test.ts keeps it equal to the token.
  themeColor: '#08130F', // ds-allow-hardcode: <meta name="theme-color"> cannot read CSS variables
  // Where the legal pages point people who have a question. Update with the repo rename (7.12).
  repoUrl: 'https://github.com/ToshifurRahman/ticket-pipe',
} as const;
