import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TURNSTILE_TEST_SECRET } from '../../../src/lib/config.js';
import { verifyTurnstile } from '../../../src/lib/turnstile.js';

// Never skipped: a real call to Cloudflare's siteverify. The integration setup file stubs fetch
// for every test, so this file puts the real one back first.
const ALWAYS_FAIL_SECRET = '2x0000000000000000000000000000000AA';
const DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

const env = { ...process.env };

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  process.env = { ...env };
});

describe('verifyTurnstile against the live siteverify endpoint', () => {
  it('accepts the documented dummy token with the always-pass secret', async () => {
    process.env.TURNSTILE_SECRET_KEY = TURNSTILE_TEST_SECRET;
    await expect(verifyTurnstile(DUMMY_TOKEN, 'local')).resolves.toBe('ok');
  }, 20000);

  it('refuses the same token with the always-fail secret', async () => {
    process.env.TURNSTILE_SECRET_KEY = ALWAYS_FAIL_SECRET;
    await expect(verifyTurnstile(DUMMY_TOKEN, 'local')).resolves.toBe('invalid');
  }, 20000);
});
