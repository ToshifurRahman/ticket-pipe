import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

// Server-supplied text (ticket subjects, AI replies) must only ever reach the page as React
// text, never as markup. Rendering it through innerHTML would turn a ticket into an XSS hole.
const SRC = path.resolve(import.meta.dirname, '../web/src');
const FORBIDDEN = /dangerouslySetInnerHTML|\.innerHTML|\.outerHTML|insertAdjacentHTML/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.guard.test.ts') ? [full] : [];
  });
}

it('never renders HTML from a string', () => {
  const offenders = sourceFiles(SRC).filter((file) => FORBIDDEN.test(readFileSync(file, 'utf8')));
  expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
});
