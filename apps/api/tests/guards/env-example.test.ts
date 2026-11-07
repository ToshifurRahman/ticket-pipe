/**
 * .env.example documents every variable the config schema knows (PA-7.3-05). A commented
 * `# KEY=` line counts, because optional variables are listed that way.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { ENV_KEYS } from '../../src/lib/config.js';

const EXAMPLE = readFileSync(path.resolve(import.meta.dirname, '../../../../.env.example'), 'utf8');
const listed = new Set(
  [...EXAMPLE.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1])
);

describe('.env.example', () => {
  it('lists every variable of the config schema', () => {
    expect(ENV_KEYS.filter((key) => !listed.has(key))).toEqual([]);
  });

  it('lists the web build variables in their own section', () => {
    const web = EXAMPLE.slice(EXAMPLE.indexOf('# --- Web build'));
    for (const key of ['VITE_TURNSTILE_SITE_KEY', 'VITE_CF_ANALYTICS_TOKEN', 'VITE_SITE_URL']) {
      expect(web).toContain(`${key}=`);
      expect(ENV_KEYS).not.toContain(key);
    }
  });

  it('uses a placeholder sender, not a real-looking domain', () => {
    expect(EXAMPLE).toMatch(/^MAIL_FROM=noreply@example\.com$/m);
  });
});
