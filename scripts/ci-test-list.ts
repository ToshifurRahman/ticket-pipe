import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Story 7.7: the parallel unit and integration steps leave out two files that run in their own
// serial step. This check keeps the lists in step: no serial file may disappear, the script's
// serial list and parallel exclude list must match, and the workflow must agree with both.
export const SERIAL_TESTS = [
  'tests/guards/format.test.ts',
  'tests/integration/repositories/ai-interactions.test.ts',
] as const;

export const PARALLEL_EXCLUDES = [...SERIAL_TESTS];

export interface TestListInput {
  serial: readonly string[];
  excluded: readonly string[];
  exists: (file: string) => boolean;
  workflow: string;
}

const sortedUnique = (files: readonly string[]) => [...new Set(files)].sort().join('\n');

export function validateTestList({ serial, excluded, exists, workflow }: TestListInput): string[] {
  const errors: string[] = [];
  for (const file of serial) {
    if (!exists(file)) errors.push(`serial file does not exist: ${file}`);
  }

  if (sortedUnique(serial) !== sortedUnique(excluded)) {
    errors.push('the serial list and the parallel exclude list differ');
  }

  const workflowExcludes = [...workflow.matchAll(/--exclude[= ]+(\S+)/g)].map((match) =>
    match[1].replace(/^['"]|['"]$/g, '')
  );
  if (sortedUnique(workflowExcludes) !== sortedUnique(excluded)) {
    errors.push('the workflow exclude list and the script exclude list differ');
  }

  const serialSteps = workflow.split('\n').filter((line) => line.includes('--no-file-parallelism'));
  for (const file of serial) {
    if (!serialSteps.some((line) => line.includes(file))) {
      errors.push(`the workflow does not run serial file: ${file}`);
    }
  }

  return errors;
}

if (import.meta.main) {
  const root = process.cwd();
  const errors = validateTestList({
    serial: SERIAL_TESTS,
    excluded: PARALLEL_EXCLUDES,
    exists: (file) => existsSync(path.join(root, 'apps/api', file)),
    workflow: readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf-8'),
  });
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log(
    `ok: ${SERIAL_TESTS.length} files run serially and are excluded from the parallel steps`
  );
}
