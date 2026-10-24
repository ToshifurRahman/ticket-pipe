import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('keeps a token font size next to a text colour', () => {
    expect(cn('text-caption', 'text-primary')).toBe('text-caption text-primary');
    expect(cn('text-meta', 'text-muted-foreground')).toBe('text-meta text-muted-foreground');
  });

  it('lets a later font size replace an earlier one', () => {
    expect(cn('text-caption', 'text-meta')).toBe('text-meta');
    expect(cn('text-sm', 'text-caption')).toBe('text-caption');
  });
});
