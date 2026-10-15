// Story 6.8 quality gate. `bun run lighthouse` (scripts/lighthouse.ts) builds the site, starts
// the e2e stack, seeds one finished ticket and sets LH_BASE_URL / LH_TICKET_REF for this file.
// Default mobile preset (what DevTools shows a reviewer): throttled CPU and network.
const base = process.env.LH_BASE_URL;
const ref = process.env.LH_TICKET_REF;
if (!base || !ref) throw new Error('Run this through `bun run lighthouse`: LH_BASE_URL / LH_TICKET_REF are not set.');

const MIN = 0.9;

module.exports = {
  ci: {
    collect: {
      url: [`${base}/`, `${base}/new`, `${base}/t/${ref}`],
      numberOfRuns: 3,
      chromePath: process.env.LH_CHROME_PATH,
      settings: { chromeFlags: '--headless=new --no-sandbox' },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: MIN, aggregationMethod: 'median' }],
        'categories:accessibility': ['error', { minScore: MIN, aggregationMethod: 'median' }],
        'categories:best-practices': ['error', { minScore: MIN, aggregationMethod: 'median' }],
        'categories:seo': ['error', { minScore: MIN, aggregationMethod: 'median' }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
