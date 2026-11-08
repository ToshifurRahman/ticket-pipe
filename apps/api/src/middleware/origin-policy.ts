import { getConfig } from '../lib/config.js';

// One decision for HTTP and Socket.IO. The config is read per request: PUBLIC_SITE_URL and
// NODE_ENV are environment, not module state, and a guard forbids reading the environment
// anywhere but lib/config.ts.
export function isOriginAllowed(
  origin: string | undefined,
  requestHost: string | undefined
): boolean {
  // A request with no Origin (curl, a probe, a same-origin GET) is not cross-site.
  if (origin === undefined) return true;

  const config = getConfig();
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    // `Origin: null`, an empty value and a malformed URL all land here.
    return false;
  }

  const siteUrl = config.PUBLIC_SITE_URL;
  if (siteUrl) {
    try {
      if (parsed.origin === new URL(siteUrl).origin) return true;
    } catch {
      // A malformed PUBLIC_SITE_URL matches nothing; startup validation does not parse it.
    }
  }

  // Dev servers (Vite on 5173) and the e2e stack on 3100 are plain http on localhost.
  if (config.NODE_ENV !== 'production') {
    const localHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol === 'http:' && localHost) return true;
  }

  // A production image with no PUBLIC_SITE_URL still serves its own pages: the browser then
  // sends an Origin whose host equals the request's Host header. URL parsing lower-cases the
  // Origin, so the raw Host is lower-cased too.
  if (!siteUrl && requestHost !== undefined && parsed.host === requestHost.toLowerCase())
    return true;

  return false;
}
