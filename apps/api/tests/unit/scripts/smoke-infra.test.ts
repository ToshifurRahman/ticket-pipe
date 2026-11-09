import { describe, expect, it, vi } from 'vitest';

import {
  CHECK_NAMES,
  defaultChecks,
  postgresConnectionConfig,
  redisCheck,
  runSmoke,
  type SmokeChecks,
  smokeMessageBody,
} from '../../../scripts/smoke-infra.js';

const URL_WITH_SECRET = 'postgresql://user:fake-secret-value@db.example:5432/db';
const KEY = 'fake-secret-value';
const ARN = 'arn:aws:iam::123456789012:user/smoke';

function ok(): SmokeChecks {
  return {
    awsIdentity: () => true,
    awsNotLocal: () => true,
    sqsRoundTrip: () => true,
    postgres: () => true,
    redis: () => true,
    redisTls: () => true,
  };
}

function capture(): { lines: string[]; print: (line: string) => void } {
  const lines: string[] = [];
  return { lines, print: (line) => lines.push(line) };
}

describe('smoke-infra output', () => {
  it('prints one ok line per check and exits 0 when everything passes', async () => {
    const { lines, print } = capture();
    const code = await runSmoke(ok(), print);

    expect(code).toBe(0);
    expect(lines).toEqual(CHECK_NAMES.map((name) => `${name} ok`));
  });

  it('prints WRONG, no error text, and exits non-zero when a check throws', async () => {
    const { lines, print } = capture();
    const checks = ok();
    checks.postgres = () => {
      throw new Error(`connect failed: ${URL_WITH_SECRET}`);
    };
    checks.redis = () => {
      throw new Error(`AUTH failed with ${KEY} for ${ARN}`);
    };

    const code = await runSmoke(checks, print);

    expect(code).toBe(1);
    const output = lines.join('\n');
    expect(output).toContain('postgres WRONG');
    expect(output).toContain('redis WRONG');
    expect(output).not.toContain(URL_WITH_SECRET);
    expect(output).not.toContain(KEY);
    expect(output).not.toContain(ARN);
    expect(output).not.toContain('connect failed');
    expect(output).not.toContain('AUTH failed');
    expect(lines).toHaveLength(CHECK_NAMES.length);
  });

  it('reports a false check as WRONG without throwing', async () => {
    const { lines, print } = capture();
    const checks = ok();
    checks.awsIdentity = () => false;

    expect(await runSmoke(checks, print)).toBe(1);
    expect(lines).toContain('aws-identity WRONG');
  });
});

describe('smoke-infra redis failure', () => {
  it('prints only redis WRONG when the connection fails, with no raw error text', async () => {
    const { lines, print } = capture();
    const checks = ok();
    checks.redis = () => redisCheck({ REDIS_URL: 'redis://127.0.0.1:1' });

    const code = await runSmoke(checks, print);

    expect(code).toBe(1);
    expect(lines).toContain('redis WRONG');
    const output = lines.join('\n');
    expect(output).not.toContain('127.0.0.1');
    expect(output).not.toContain('ECONNREFUSED');
    expect(output).not.toContain('error');
  });
});

describe('smoke-infra postgres TLS', () => {
  const base = 'postgresql://user:fake-secret-value@db.example:5432/db';

  it.each(['disable', 'prefer', 'allow', 'no-verify'])('reports sslmode=%s as WRONG', (mode) => {
    expect(() => postgresConnectionConfig(`${base}?sslmode=${mode}`)).toThrow();
  });

  it('reports ssl=0 as WRONG', () => {
    expect(() => postgresConnectionConfig(`${base}?ssl=0`)).toThrow();
  });

  it.each(['require', 'verify-ca', 'verify-full'])(
    'accepts sslmode=%s and strips it so pg prints no security warning',
    (mode) => {
      const config = postgresConnectionConfig(`${base}?sslmode=${mode}`);
      expect(config.connectionString).not.toContain('sslmode');
      expect(config.ssl).toEqual({ rejectUnauthorized: true });
    }
  );

  it('accepts a URL with no ssl parameters and still forces TLS', () => {
    const config = postgresConnectionConfig(base);
    expect(config.connectionString).toBe(base);
    expect(config.ssl).toEqual({ rejectUnauthorized: true });
  });
});

describe('smoke-infra configuration and message shape', () => {
  it('prints only WRONG for a bad environment, with no raw error or value', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { lines, print } = capture();
      const code = await runSmoke(defaultChecks({ PORT: 'fake-secret-value' }), print);

      expect(code).toBe(1);
      expect(lines).toEqual(CHECK_NAMES.map((name) => `${name} WRONG`));
      expect(error).not.toHaveBeenCalled();
      expect(lines.join('\n')).not.toContain('fake-secret-value');
    } finally {
      error.mockRestore();
    }
  });

  it('sends the smoke id inside the app queue JSON envelope', () => {
    const body = smokeMessageBody('smoke-12345678');
    expect(JSON.parse(body)).toEqual({
      ticketId: 'smoke-12345678',
      referenceNumber: 'SMOKE-smoke-12',
    });
  });
});
