import { describe, it, expect, vi } from 'vitest';

vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    duplicate: vi.fn(),
    publish: vi.fn().mockResolvedValue(1),
  })),
}));

import { getEmitter } from '../../src/lib/socket.js';

describe('getEmitter', () => {
  it('returns the same emitter instance on repeated calls (lazy singleton)', () => {
    const first = getEmitter();
    const second = getEmitter();
    expect(first).toBe(second);
  });
});
