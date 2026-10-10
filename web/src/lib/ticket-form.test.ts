import { describe, expect, it } from 'vitest';
import { ticketFormSchema } from './ticket-form';

const subject = 'Cannot export CSV';
const description = 'The export button spins and then nothing downloads.';

function errorsFor(values: { subject: string; description: string }) {
  const result = ticketFormSchema.safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]));
}

describe('ticketFormSchema', () => {
  it('accepts values at both edges of each limit', () => {
    expect(ticketFormSchema.safeParse({ subject: 'abc', description: 'x'.repeat(20) }).success).toBe(true);
    expect(ticketFormSchema.safeParse({ subject: 'a'.repeat(120), description: 'x'.repeat(5000) }).success).toBe(true);
  });

  it.each([
    [{ subject: '', description }, { subject: 'Subject is required' }],
    [{ subject: '   ', description }, { subject: 'Subject is required' }],
    [{ subject: 'ab', description }, { subject: 'Subject needs at least 3 characters.' }],
    [{ subject: 'a'.repeat(121), description }, { subject: 'Subject can be at most 120 characters.' }],
    [{ subject, description: '' }, { description: 'Description is required' }],
    [{ subject, description: 'x'.repeat(19) }, { description: 'Description needs at least 20 characters.' }],
    [{ subject, description: 'x'.repeat(5001) }, { description: 'Description can be at most 5000 characters.' }],
  ])('reports the same message as the API for %j', (values, expected) => {
    expect(errorsFor(values)).toEqual(expected);
  });

  it('counts length after trimming, like the API', () => {
    expect(errorsFor({ subject: '  ab  ', description: `  ${'x'.repeat(19)}  ` })).toEqual({
      subject: 'Subject needs at least 3 characters.',
      description: 'Description needs at least 20 characters.',
    });
  });
});
