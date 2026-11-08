import { afterEach, beforeEach, vi } from 'vitest';

import { useSiteVerify } from '../helpers/siteverify.js';

// Cloudflare's siteverify is the one network call the integration suites would otherwise make.
beforeEach(() => {
  useSiteVerify();
});

afterEach(() => {
  vi.unstubAllGlobals();
});
