import type { Page } from '@playwright/test';

// Cloudflare's script is replaced by a stub that passes at once, so the run is offline and
// deterministic. The real widget (test site key) is checked by hand in dev.
const TURNSTILE_STUB = `
  window.turnstile = {
    render(el, opts) { this.cb = opts.callback; setTimeout(() => this.cb('e2e-token')); return 'w1'; },
    reset() { setTimeout(() => this.cb && this.cb('e2e-token')); },
    remove() {},
  };
`;

export async function stubTurnstile(page: Page): Promise<void> {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: TURNSTILE_STUB })
  );
}
