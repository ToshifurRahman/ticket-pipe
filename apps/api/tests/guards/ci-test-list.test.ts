import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  PARALLEL_STEPS,
  SERIAL_TESTS,
  validateTestList,
} from '../../../../scripts/ci-test-list.js';

const root = path.resolve(import.meta.dirname, '../../../..');

// Story 7.7: the parallel unit and integration steps exclude exactly the files the serial step
// runs, so no test is lost. scripts/ci-test-list.ts is what CI runs before the tests.
const consistent = {
  serial: ['tests/guards/format.test.ts', 'tests/integration/repositories/ai-interactions.test.ts'],
  steps: [
    { command: 'test:unit', excluded: ['tests/guards/format.test.ts'] },
    {
      command: 'test:integration',
      excluded: ['tests/integration/repositories/ai-interactions.test.ts'],
    },
  ],
  exists: () => true,
  workflow:
    'run: bun test:unit --exclude tests/guards/format.test.ts\n' +
    'run: bun test:integration --exclude tests/integration/repositories/ai-interactions.test.ts\n' +
    'run: vitest run tests/guards/format.test.ts tests/integration/repositories/ai-interactions.test.ts --no-file-parallelism',
};

describe('the CI test split', () => {
  it('accepts a split where every serial file exists and both lists match the workflow', () => {
    expect(validateTestList(consistent)).toEqual([]);
  });

  it('fails when a serial file no longer exists', () => {
    expect(validateTestList({ ...consistent, exists: () => false })).toEqual([
      'serial file does not exist: tests/guards/format.test.ts',
      'serial file does not exist: tests/integration/repositories/ai-interactions.test.ts',
    ]);
  });

  it('fails when the serial list and the parallel exclude list differ', () => {
    expect(
      validateTestList({
        ...consistent,
        steps: [{ command: 'test:unit', excluded: ['tests/guards/format.test.ts'] }],
      })
    ).toContain('the serial list and the parallel exclude list differ');
  });

  it('fails when the workflow excludes a file the script does not list', () => {
    expect(
      validateTestList({
        ...consistent,
        workflow: `${consistent.workflow}\nrun: bun test --exclude tests/unit/extra.test.ts`,
      })
    ).toContain('the workflow exclude list and the script exclude list differ');
  });

  it('fails when the serial step does not run a serial file', () => {
    expect(
      validateTestList({
        ...consistent,
        workflow: consistent.workflow.replace(
          ' tests/integration/repositories/ai-interactions.test.ts --no-file-parallelism',
          ' --no-file-parallelism'
        ),
      })
    ).toContain(
      'the workflow does not run serial file: tests/integration/repositories/ai-interactions.test.ts'
    );
  });

  it('fails when an exclude sits in the wrong step', () => {
    expect(
      validateTestList({
        ...consistent,
        workflow: consistent.workflow
          .replace(
            'test:unit --exclude tests/guards/format.test.ts',
            'test:unit --exclude tests/integration/repositories/ai-interactions.test.ts'
          )
          .replace(
            'test:integration --exclude tests/integration/repositories/ai-interactions.test.ts',
            'test:integration --exclude tests/guards/format.test.ts'
          ),
      })
    ).toContain('the workflow excludes the wrong file for test:unit');
  });

  it('fails when a serial path appears only in a comment', () => {
    expect(
      validateTestList({
        ...consistent,
        workflow:
          'run: bun test:unit --exclude tests/guards/format.test.ts\n' +
          'run: bun test:integration --exclude tests/integration/repositories/ai-interactions.test.ts\n' +
          'run: vitest run tests/guards/format.test.ts --no-file-parallelism\n' +
          '# tests/integration/repositories/ai-interactions.test.ts --no-file-parallelism',
      })
    ).toContain(
      'the workflow does not run serial file: tests/integration/repositories/ai-interactions.test.ts'
    );
  });

  it('matches the workflow, the script and the files in this repository', () => {
    expect(
      validateTestList({
        serial: SERIAL_TESTS,
        steps: PARALLEL_STEPS,
        exists: (file) => existsSync(path.join(root, 'apps/api', file)),
        workflow: readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf-8'),
      })
    ).toEqual([]);
  });
});
