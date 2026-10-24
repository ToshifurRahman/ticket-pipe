import { describe, it, expect } from 'vitest';
import { generateReferenceNumber } from '../../src/lib/reference.js';

describe('generateReferenceNumber', () => {
  it('matches the TICK-{timestamp}-{4-hex} format', () => {
    const ref = generateReferenceNumber();
    expect(ref).toMatch(/^TICK-\d+-[0-9A-F]{8}$/);
  });

  it('produces no duplicates across 1000 calls', () => {
    const refs = new Set(Array.from({ length: 1000 }, generateReferenceNumber));
    expect(refs.size).toBe(1000);
  });
});
