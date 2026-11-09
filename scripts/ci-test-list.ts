import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Story 7.7: the parallel unit and integration steps leave out two files that run in their own
// serial step. This check keeps the lists in step: no serial file may disappear, each step must
// exclude its own file, and the workflow must run both files on the serial vitest line.
export const SERIAL_TESTS = [
  'tests/guards/format.test.ts',
  'tests/integration/repositories/ai-interactions.test.ts',
] as const;

export interface ParallelStep {
  command: string;
  excluded: readonly string[];
}

export const PARALLEL_STEPS: readonly ParallelStep[] = [
  { command: 'test:unit', excluded: ['tests/guards/format.test.ts'] },
  {
    command: 'test:integration',
    excluded: ['tests/integration/repositories/ai-interactions.test.ts'],
  },
];

export interface TestListInput {
  serial: readonly string[];
  steps: readonly ParallelStep[];
  exists: (file: string) => boolean;
  workflow: string;
}

const sortedUnique = (files: readonly string[]) => [...new Set(files)].sort().join('\n');

// Comments are not commands: a path or an exclude that only appears in one proves nothing.
const commandLines = (workflow: string) =>
  workflow.split('\n').filter((line) => !line.trimStart().startsWith('#'));

const excludesOn = (line: string) =>
  [...line.matchAll(/--exclude[= ]+(\S+)/g)].map((match) => match[1].replace(/^['"]|['"]$/g, ''));

export function validateTestList({ serial, steps, exists, workflow }: TestListInput): string[] {
  const errors: string[] = [];
  for (const file of serial) {
    if (!exists(file)) errors.push(`serial file does not exist: ${file}`);
  }

  const excluded = steps.flatMap((step) => [...step.excluded]);
  if (sortedUnique(serial) !== sortedUnique(excluded)) {
    errors.push('the serial list and the parallel exclude list differ');
  }

  const commands = commandLines(workflow);
  for (const step of steps) {
    const inStep = commands
      .filter((line) => line.includes(step.command))
      .flatMap((line) => excludesOn(line));
    if (sortedUnique(inStep) !== sortedUnique(step.excluded)) {
      errors.push(`the workflow excludes the wrong file for ${step.command}`);
    }
  }

  const inWorkflow = commands.flatMap((line) => excludesOn(line));
  if (sortedUnique(inWorkflow) !== sortedUnique(excluded)) {
    errors.push('the workflow exclude list and the script exclude list differ');
  }

  const serialLines = commands.filter(
    (line) => line.includes('--no-file-parallelism') && line.includes('vitest')
  );
  for (const file of serial) {
    if (!serialLines.some((line) => line.includes(file))) {
      errors.push(`the workflow does not run serial file: ${file}`);
    }
  }

  return errors;
}

if (import.meta.main) {
  const root = process.cwd();
  const errors = validateTestList({
    serial: SERIAL_TESTS,
    steps: PARALLEL_STEPS,
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
