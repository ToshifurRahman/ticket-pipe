import { describe, expect, it } from 'vitest';
import { isValidRef, normalizeRef } from './ticket-ref';

describe('ticket-ref', () => {
  it('trims and uppercases', () => {
    expect(normalizeRef('  tick-1759993412345-a1b2c3d4 ')).toBe('TICK-1759993412345-A1B2C3D4');
  });

  it('accepts a real reference in any case', () => {
    expect(isValidRef('TICK-1759993412345-A1B2C3D4')).toBe(true);
    expect(isValidRef(' tick-1759993412345-a1b2c3d4 ')).toBe(true);
  });

  it.each(['', 'hello', 'TICK-123-A1B2C3D4', 'TICK-1759993412345-XYZ', 'TCK-7Q4M-2KD9', 'TICK-1759993412345-A1B2C3D4-X'])(
    'rejects %j',
    (input) => {
      expect(isValidRef(input)).toBe(false);
    }
  );
});
