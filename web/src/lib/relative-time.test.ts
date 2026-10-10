import { describe, expect, it } from 'vitest';
import { relativeTime } from './relative-time';

const now = Date.parse('2026-10-10T12:00:00.000Z');
const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

describe('relativeTime', () => {
  it.each([
    [10, 'just now'],
    [5 * 60, '5 minutes ago'],
    [3 * 3600, '3 hours ago'],
    [24 * 3600, 'yesterday'],
    [2 * 24 * 3600, '2 days ago'],
  ])('%is ago reads "%s"', (seconds, expected) => {
    expect(relativeTime(ago(seconds), now)).toBe(expected);
  });

  it('returns an empty string for an unparseable date', () => {
    expect(relativeTime('not a date', now)).toBe('');
  });
});
