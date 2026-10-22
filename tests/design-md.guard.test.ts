import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// DESIGN.md records the shipped design system. Its "Colour primitives" table must list every
// token under `primitive.color` in web/tokens/colors.json with the same hex, so a token edit
// fails here until the document is updated.

const ROOT = path.resolve(import.meta.dirname, '..');
const design = readFileSync(path.join(ROOT, 'DESIGN.md'), 'utf8');
const colors = JSON.parse(readFileSync(path.join(ROOT, 'web/tokens/colors.json'), 'utf8')) as {
  primitive: { color: Record<string, { $value: string }> };
};

const ROW = /^\|\s*`([a-z0-9-]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|/;

function documentedColours(): Map<string, string> {
  const rows = new Map<string, string>();
  for (const line of design.split('\n')) {
    const match = ROW.exec(line);
    if (match) rows.set(match[1]!, match[2]!);
  }
  return rows;
}

// The front matter repeats the primitives as `name: "#HEX"`; the same rule applies to it.
function frontMatterColours(): Map<string, string> {
  const block = /^---\n([\s\S]*?)\n---/.exec(design)?.[1] ?? '';
  const colourBlock = /^colors:\n((?: {2}.*\n?)+)/m.exec(block)?.[1] ?? '';
  const rows = new Map<string, string>();
  for (const match of colourBlock.matchAll(/^ {2}([a-z0-9-]+):\s*"(#[0-9A-Fa-f]{6})"/gm)) rows.set(match[1]!, match[2]!);
  return rows;
}

describe('DESIGN.md colour primitives', () => {
  it('front matter lists the same primitives with the same values', () => {
    const expected = Object.fromEntries(
      Object.entries(colors.primitive.color).map(([name, token]) => [name, token.$value.toUpperCase()])
    );
    const actual = Object.fromEntries([...frontMatterColours()].map(([name, hex]) => [name, hex.toUpperCase()]));
    expect(actual).toEqual(expected);
  });

  const documented = documentedColours();
  const source = Object.entries(colors.primitive.color).map(([name, token]) => [name, token.$value] as const);

  it('lists every primitive colour token', () => {
    expect([...documented.keys()].sort()).toEqual(source.map(([name]) => name).sort());
  });

  it.each(source)('%s has the token value', (name, value) => {
    expect(documented.get(name)?.toUpperCase()).toBe(value.toUpperCase());
  });

  it('names the Full Demo as the authority and links the deviations file', () => {
    expect(design).toContain('KgujCr5HHmouNMgx9bHwzo');
    expect(design).toContain('docs/design-deviations.md');
  });
});
