// Story 6.8 quality gate. `bun run lighthouse` (scripts/lighthouse.ts) builds the site, starts
// the e2e stack, seeds one finished ticket and sets LH_BASE_URL / LH_TICKET_REF for this file.
// Default mobile preset (what DevTools shows a reviewer): throttled CPU and network.
const base = process.env.LH_BASE_URL;
const ref = process.env.LH_TICKET_REF;
if (!base || !ref) throw new Error('Run this through `bun run lighthouse`: LH_BASE_URL / LH_TICKET_REF are not set.');

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
const MIN_SCORE = { minScore: 0.9, aggregationMethod: 'median' };

module.exports = {
  ci: {
    collect: {
      url: [
        `${base}/`,
        `${base}/new`,
        `${base}/t/${ref}`,
        `${base}/confirm/lighthouse-token`,
        `${base}/ops`,
        `${base}/legal/privacy`,
        `${base}/legal/terms`,
        `${base}/nope`,
      ],
      numberOfRuns: 3,
      chromePath: process.env.LH_CHROME_PATH,
      settings: { chromeFlags: '--headless=new --no-sandbox' },
    },
    assert: {
      assertMatrix: [
        {
          // Crawlable pages: all four categories.
          matchingUrlPattern: '^(?!.*/(confirm|ops)(/|$)).*$',
          assertions: Object.fromEntries(CATEGORIES.map((c) => [`categories:${c}`, ['error', MIN_SCORE]])),
        },
        {
          // These two are noindex on purpose (a private link, a staff console), so SEO's
          // is-crawlable audit fails by design and is left out.
          matchingUrlPattern: '/(confirm|ops)(/|$)',
          assertions: Object.fromEntries(
            CATEGORIES.filter((c) => c !== 'seo').map((c) => [`categories:${c}`, ['error', MIN_SCORE]])
          ),
        },
      ],
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
