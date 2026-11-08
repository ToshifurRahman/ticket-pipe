import type { Page } from '@playwright/test';

// Cloudflare's script is replaced by a stub that passes at once, so the run is offline and
// deterministic. The token is Cloudflare's documented dummy, which the test secret accepts
// through the real siteverify call the API now makes.
export const TURNSTILE_DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

const TURNSTILE_STUB = `
  window.turnstile = {
    render(el, opts) { this.cb = opts.callback; setTimeout(() => this.cb('${TURNSTILE_DUMMY_TOKEN}')); return 'w1'; },
    reset() { setTimeout(() => this.cb && this.cb('${TURNSTILE_DUMMY_TOKEN}')); },
    remove() {},
  };
`;

export async function stubTurnstile(page: Page): Promise<void> {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: TURNSTILE_STUB })
  );
}
