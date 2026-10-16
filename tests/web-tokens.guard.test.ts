import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildTokensCss, OUTPUT, resolveToken } from '../scripts/build-tokens';

// web/tokens/*.json is the design system's source of truth; web/src/styles/tokens.css is
// generated from it and committed. These guard the two things that drift silently: a hand
// edit to the CSS (or a JSON edit without `bun run tokens`), and a token change that drops
// a Red Rule pair below WCAG AA.

it('tokens.css is up to date with web/tokens (run `bun run tokens`)', () => {
  expect(readFileSync(OUTPUT, 'utf8')).toBe(buildTokensCss());
});

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

// The generic pairs (body, secondary, link, primary action, control border) are covered by
// the design-kit's validate_contrast; these are the ones only this palette has.
const TEXT_PAIRS: [fg: string, bg: string][] = [
  ['semantic.action.urgent', 'semantic.surface.page'],
  ['semantic.action.urgent', 'semantic.surface.card'],
  ['semantic.action.urgent', 'semantic.surface.raised'],
  ['semantic.text.on-urgent', 'semantic.action.urgent'],
  ['semantic.text.secondary', 'semantic.surface.card'],
  ['semantic.text.secondary', 'semantic.surface.raised'],
  ['semantic.ply.received-text', 'semantic.ply.received'],
  ['semantic.ply.triaged-text', 'semantic.ply.triaged'],
  ['semantic.ply.live-text', 'semantic.ply.live'],
  ['semantic.ply.replied-text', 'semantic.ply.replied'],
  ['semantic.ply.on-hold-text', 'semantic.ply.on-hold'],
];

describe.each(['paper', 'dark'] as const)('Red Rule contrast (%s)', (mode) => {
  it.each(TEXT_PAIRS)('%s on %s is at least 4.5:1', (fg, bg) => {
    const ratio = contrast(resolveToken('colors.json', fg, mode), resolveToken('colors.json', bg, mode));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('the focus ring is at least 3:1 on every surface', () => {
    const ring = resolveToken('colors.json', 'semantic.border.focus', mode);
    for (const surface of ['page', 'card', 'raised']) {
      expect(contrast(ring, resolveToken('colors.json', `semantic.surface.${surface}`, mode))).toBeGreaterThanOrEqual(3);
    }
  });
});
