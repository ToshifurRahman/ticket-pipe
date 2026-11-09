import { describe, expect, it } from 'vitest';

import { CHECK_NAMES, runSmoke, type SmokeChecks } from '../../../scripts/smoke-infra.js';

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
