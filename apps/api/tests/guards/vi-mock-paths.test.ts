/**
 * Story 7.0.6 — a `vi.mock()` that points at a file which no longer exists mocks nothing and the
 * test still passes against the real module. Every mock path must be a string literal that
 * resolves to a source file or an installed package.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

const API = path.resolve(import.meta.dirname, '../..');
const TESTS = path.join(API, 'tests');
const SELF = import.meta.filename;
const requireFromApi = createRequire(path.join(API, 'package.json'));

const MOCK_CALL = /\bvi\.(?:do)?[mM]ock\(\s*([^,)\n]*)/g;
const LITERAL = /^(['"`])([^'"`$]*)\1$/;

function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? testFiles(full) : entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

function resolves(file: string, specifier: string): boolean {
  if (specifier.startsWith('.')) {
    const target = path.resolve(path.dirname(file), specifier);
    return [target, target.replace(/\.js$/, '.ts'), `${target}.ts`, `${target}/index.ts`].some(
      (candidate) => existsSync(candidate)
    );
  }
  try {
    requireFromApi.resolve(specifier);
    return true;
  } catch {
    return false;
  }
}

/** One message per mock call that is not a literal, or whose path does not resolve. */
function brokenMocks(files: string[]): string[] {
  return files.flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(MOCK_CALL)].flatMap(([, arg]) => {
      const literal = LITERAL.exec(arg.trim());
      const where = path.relative(API, file);
      if (!literal) return [`${where}: vi.mock path is not a string literal (${arg.trim()})`];
      return resolves(file, literal[2]) ? [] : [`${where}: ${literal[2]} does not resolve`];
    })
  );
}

describe('vi.mock paths', () => {
  it('every mock in tests/ points at something that exists', () => {
    // This file's own self-test below writes deliberately broken mock calls as strings.
    expect(brokenMocks(testFiles(TESTS).filter((file) => file !== SELF))).toEqual([]);
  });

  it('catches a missing path, a missing package and a computed path', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vi-mock-paths-'));
    try {
      const file = path.join(dir, 'broken.test.ts');
      writeFileSync(
        file,
        [
          "vi.mock('./gone.js', () => ({}));",
          "vi.mock('no-such-package-7-0-6', () => ({}));",
          'vi.mock(`./${name}.js`, () => ({}));',
          "vi.mock('vitest', () => ({}));",
        ].join('\n')
      );
      expect(brokenMocks([file]).map((message) => message.split(': ')[1])).toEqual([
        './gone.js does not resolve',
        'no-such-package-7-0-6 does not resolve',
        'vi.mock path is not a string literal (`./${name}.js`)',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
