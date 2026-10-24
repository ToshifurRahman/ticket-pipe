import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Analytics } from './analytics';

const beacons = () => document.head.querySelectorAll('script[src*="cloudflareinsights"]');

afterEach(() => {
  vi.unstubAllEnvs();
  document.head.querySelectorAll('script').forEach((el) => el.remove());
});

describe('Analytics', () => {
  it('adds nothing outside a production build', () => {
    vi.stubEnv('PROD', false);
    vi.stubEnv('VITE_CF_ANALYTICS_TOKEN', 'tok');
    render(<Analytics />);
    expect(beacons()).toHaveLength(0);
  });

  it('adds nothing in production without a token', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_CF_ANALYTICS_TOKEN', '');
    render(<Analytics />);
    expect(beacons()).toHaveLength(0);
  });

  it('adds the beacon once in production with a token, even when mounted twice', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_CF_ANALYTICS_TOKEN', 'tok-123');
    const first = render(<Analytics />);
    first.unmount();
    render(<Analytics />);

    const found = beacons();
    expect(found).toHaveLength(1);
    expect(JSON.parse((found[0] as HTMLScriptElement).dataset.cfBeacon!)).toEqual({ token: 'tok-123' });
  });
});
