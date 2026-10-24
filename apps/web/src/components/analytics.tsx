import { useEffect } from 'react';

const SCRIPT_ID = 'cf-web-analytics';
const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';

// Cloudflare Web Analytics: cookieless. Loaded only in a production build that has a token, so
// dev, tests and the e2e build never talk to Cloudflare. It follows SPA route changes itself.
// The CSP in story 7.4 must allow the script and its reporting endpoint.
export function Analytics() {
  useEffect(() => {
    const token = import.meta.env.VITE_CF_ANALYTICS_TOKEN;
    if (!import.meta.env.PROD || !token) return;
    // A confirmation link carries a credential in its path; never hand that URL to a beacon.
    if (window.location.pathname.startsWith('/confirm/')) return;
    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.defer = true;
    script.src = BEACON_SRC;
    script.dataset.cfBeacon = JSON.stringify({ token });
    document.head.appendChild(script);
  }, []);

  return null;
}
