/**
 * Story 5.7 — SNS alerts carry the same privacy boundary as the ops feed, so exactly one
 * module may publish to SNS. If this fails, a new publish site was added: route it through
 * src/services/ops-alerts.ts instead.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../src');
const ALLOWED = path.join(SRC, 'services', 'ops-alerts.ts');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('SNS publishing', () => {
  it('only src/services/ops-alerts.ts uses PublishCommand', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => file !== ALLOWED)
      .filter((file) => /\bPublish(Batch)?Command\b/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file));

    expect(offenders).toEqual([]);
  });

  it('the allowed module really does publish (the guard is not vacuous)', () => {
    expect(readFileSync(ALLOWED, 'utf8')).toMatch(/new PublishCommand\(/);
  });
});
