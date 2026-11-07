import { describe, expect, it } from 'vitest';

import { clientIp } from '../../../src/middleware/client-ip.js';

const header = (value: string | undefined) => ({ req: { header: () => value } });

describe('clientIp', () => {
  it('takes the last X-Forwarded-For hop, ignoring a spoofed first hop', () => {
    expect(clientIp(header('203.0.113.9, 198.51.100.4, 192.0.2.7'))).toBe('192.0.2.7');
  });

  it('trims whitespace and skips empty hops', () => {
    expect(clientIp(header(' 203.0.113.9 , , 192.0.2.7 '))).toBe('192.0.2.7');
  });

  it("falls back to 'local' when the header is absent", () => {
    expect(clientIp(header(undefined))).toBe('local');
    expect(clientIp(header(''))).toBe('local');
  });
});
