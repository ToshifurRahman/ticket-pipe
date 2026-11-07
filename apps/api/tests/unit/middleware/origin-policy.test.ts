import { describe, expect, it, vi } from 'vitest';

const { getConfig } = vi.hoisted(() => ({
  getConfig: vi.fn<() => { PUBLIC_SITE_URL?: string; NODE_ENV?: string }>(),
}));

vi.mock('../../../src/lib/config.js', () => ({ getConfig }));

import { isOriginAllowed } from '../../../src/middleware/origin-policy.js';

const config = (values: { PUBLIC_SITE_URL?: string; NODE_ENV?: string }) => {
  getConfig.mockReturnValue(values);
};

describe('isOriginAllowed', () => {
  it('allows a request with no Origin header', () => {
    config({});
    expect(isOriginAllowed(undefined, 'relay.test')).toBe(true);
  });

  it('allows the origin of PUBLIC_SITE_URL, whatever its trailing slash or path', () => {
    config({ PUBLIC_SITE_URL: 'https://relay.test/' });
    expect(isOriginAllowed('https://relay.test', 'relay.test')).toBe(true);
    config({ PUBLIC_SITE_URL: 'https://relay.test/some/path' });
    expect(isOriginAllowed('https://relay.test', 'relay.test')).toBe(true);
  });

  it('rejects another site when PUBLIC_SITE_URL is set', () => {
    config({ PUBLIC_SITE_URL: 'https://relay.test', NODE_ENV: 'production' });
    expect(isOriginAllowed('https://evil.test', 'relay.test')).toBe(false);
  });

  it('allows http on localhost and 127.0.0.1 on any port outside production', () => {
    config({});
    expect(isOriginAllowed('http://localhost:5173', 'localhost:3000')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:3100', '127.0.0.1:3100')).toBe(true);
  });

  it('does not allow the localhost rule in production', () => {
    config({ NODE_ENV: 'production' });
    expect(isOriginAllowed('http://localhost:5173', 'localhost:3100')).toBe(false);
  });

  it('does not allow https localhost under the dev rule', () => {
    config({ PUBLIC_SITE_URL: 'https://relay.test' });
    expect(isOriginAllowed('https://localhost:5173', 'localhost:5173')).toBe(false);
  });

  it("allows an Origin whose host equals the request's Host when PUBLIC_SITE_URL is unset", () => {
    config({ NODE_ENV: 'production' });
    expect(isOriginAllowed('https://relay.test', 'relay.test')).toBe(true);
    expect(isOriginAllowed('https://relay.test:8443', 'relay.test:8443')).toBe(true);
  });

  it('rejects a host-equal Origin when PUBLIC_SITE_URL names another origin', () => {
    config({ PUBLIC_SITE_URL: 'https://relay.test', NODE_ENV: 'production' });
    expect(isOriginAllowed('https://other.test', 'other.test')).toBe(false);
  });

  it.each(['null', '', 'not a url', 'relay.test'])('rejects the malformed Origin %j', (origin) => {
    config({});
    expect(isOriginAllowed(origin, 'relay.test')).toBe(false);
  });
});
