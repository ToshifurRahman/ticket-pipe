import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { resolveToken } from '../scripts/build-tokens';

// The ply stamp is Carbon Set's one motion: a stage lands on the form in two hard frames
// (steps(2), 90ms), never eased, and not at all under reduced motion. 6.13 applies
// `animate-stamp` to the ply row; this pins the primitive it builds on.
const css = readFileSync(path.resolve(import.meta.dirname, '../web/src/index.css'), 'utf8');

it('animate-stamp runs the stamp keyframes on the stamp tokens', () => {
  expect(css).toContain('--animate-stamp: stamp var(--duration-stamp) var(--ease-stamp) both;');
  expect(css).toMatch(/@keyframes stamp \{/);
});

it('the stamp tokens are two hard frames in 90ms', () => {
  expect(resolveToken('scale.json', 'primitive.motion.stamp-duration')).toBe('90ms');
  expect(resolveToken('scale.json', 'primitive.motion.stamp-easing')).toMatch(/^steps\(2\b/);
});

it('reduced motion turns every animation off', () => {
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  expect(block).toMatch(/animation: none !important;/);
  expect(block).toMatch(/transition: none !important;/);
});
