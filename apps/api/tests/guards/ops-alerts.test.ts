/**
 * Story 5.7 — SNS alerts carry the same privacy boundary as the ops feed, so exactly one
 * module may publish to SNS. If this fails, a new publish site was added: route it through
 * src/services/ops-alerts.ts instead.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { sourceFiles } from '../helpers/source-files.js';

const SRC = path.resolve(__dirname, '../../src');
const ALLOWED = path.join(SRC, 'services', 'ops-alerts.ts');

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
