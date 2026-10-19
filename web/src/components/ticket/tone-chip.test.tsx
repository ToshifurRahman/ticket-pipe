import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToneChip, toneForCategory, toneForPriority } from './tone-chip';

describe('tone lookups', () => {
  it('colours a free-text category by the word it contains', () => {
    expect(toneForCategory('billing_issue')).toBe('billing');
    expect(toneForCategory('Account access')).toBe('account');
    expect(toneForCategory('technical')).toBe('tech');
    expect(toneForCategory('feature_request')).toBe('feature');
    expect(toneForCategory('something else')).toBeNull();
  });

  it('calls the schema’s critical priority urgent', () => {
    expect(toneForPriority('critical')).toBe('urgent');
    expect(toneForPriority('High')).toBe('high');
    expect(toneForPriority('whenever')).toBeNull();
  });

  it('rules and prints the chip in its tone', () => {
    render(<ToneChip tone="billing">Billing</ToneChip>);
    expect(screen.getByText('Billing').className).toContain('text-topic-billing');
  });
});
