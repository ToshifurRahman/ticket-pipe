import { describe, expect, it } from 'vitest';

import { loadConfig, parseEnv } from '../../../src/lib/config.js';

const MINIMAL: Record<string, string> = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  SQS_QUEUE_NAME: 'tickets',
  SQS_ENDPOINT: 'http://localhost:4566',
  LLM_MODE: 'fake',
  OPS_TOKEN: 'x'.repeat(32),
};

const PRODUCTION = {
  ...MINIMAL,
  NODE_ENV: 'production',
  LLM_MODE: 'real',
  GOOGLE_API_KEY: 'g',
  PORTKEY_API_KEY: 'p',
  MAIL_DRIVER: 'brevo',
  BREVO_API_KEY: 'b',
  PUBLIC_SITE_URL: 'https://relay.test',
};

describe('Turnstile and abuse-protection config', () => {
  it('defaults the hourly per-IP limit to 15 and the daily cap to 100', () => {
    const config = loadConfig(MINIMAL);
    expect(config.TICKET_IP_HOURLY_LIMIT).toBe(15);
    expect(config.TICKET_DAILY_CAP).toBe(100);
  });

  it('reads both limits from the environment', () => {
    const config = loadConfig({
      ...MINIMAL,
      TICKET_IP_HOURLY_LIMIT: '3',
      TICKET_DAILY_CAP: '0',
    });
    expect(config.TICKET_IP_HOURLY_LIMIT).toBe(3);
    expect(config.TICKET_DAILY_CAP).toBe(0);
  });

  it('rejects an hourly limit below one and a fractional cap', () => {
    const zero = parseEnv({ ...MINIMAL, TICKET_IP_HOURLY_LIMIT: '0' });
    expect(zero.success).toBe(false);
    const fraction = parseEnv({ ...MINIMAL, TICKET_DAILY_CAP: '1.5' });
    expect(fraction.success).toBe(false);
  });

  it('fails production startup without TURNSTILE_SECRET_KEY and names it', () => {
    const result = parseEnv(PRODUCTION);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toContainEqual({
      variable: 'TURNSTILE_SECRET_KEY',
      message: 'required when NODE_ENV=production',
    });
  });

  it('accepts a production secret, including a Cloudflare test secret', () => {
    for (const secret of ['real-secret', '1x0000000000000000000000000000000AA']) {
      const config = loadConfig({ ...PRODUCTION, TURNSTILE_SECRET_KEY: secret });
      expect(config.TURNSTILE_SECRET_KEY).toBe(secret);
    }
  });

  it('falls back to the always-pass test secret outside production', () => {
    expect(loadConfig(MINIMAL).TURNSTILE_SECRET_KEY).toBe('1x0000000000000000000000000000000AA');
    expect(
      loadConfig({ ...MINIMAL, TURNSTILE_SECRET_KEY: 'own-secret' }).TURNSTILE_SECRET_KEY
    ).toBe('own-secret');
  });
});
