import { describe, expect, it } from 'vitest';
import { listQuery, parseOpsParams, toSearchParams } from './ops-params';

const ID = '3f6c0a52-1111-4222-8333-944455556666';
const parse = (qs: string) => parseOpsParams(new URLSearchParams(qs));

describe('parseOpsParams', () => {
  it('defaults to All, page 1, newest update first, nothing open', () => {
    expect(parse('')).toEqual({ tab: 'all', page: 1, sort: 'updatedAt', order: 'desc', ticket: null });
  });

  it('reads every param', () => {
    expect(parse(`status=failed&page=3&sort=createdAt&order=asc&ticket=${ID}`)).toEqual({
      tab: 'failed',
      page: 3,
      sort: 'createdAt',
      order: 'asc',
      ticket: ID,
    });
  });

  it('ignores junk instead of throwing', () => {
    expect(parse('status=nope&page=-2&sort=priority&order=sideways&ticket=not-a-uuid')).toEqual(parse(''));
    expect(parse('page=1.5').page).toBe(1);
  });
});

describe('toSearchParams', () => {
  it('writes only what differs from the defaults', () => {
    expect(toSearchParams(parse('')).toString()).toBe('');
    expect(toSearchParams(parse('status=failed&page=2')).toString()).toBe('status=failed&page=2');
  });

  it('round-trips', () => {
    const qs = `status=needs_attention&page=4&sort=createdAt&order=asc&ticket=${ID}`;
    expect(parse(toSearchParams(parse(qs)).toString())).toEqual(parse(qs));
  });
});

describe('listQuery', () => {
  it('sends the tab as a status filter and always the sort', () => {
    expect(listQuery(parse('status=failed&page=2'))).toBe('page=2&limit=20&sort=updatedAt&order=desc&status=failed');
    expect(listQuery(parse(''))).toBe('page=1&limit=20&sort=updatedAt&order=desc');
  });
});
