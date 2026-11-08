import { secureHeaders } from 'hono/secure-headers';

// The directives proven by the real browser run in probes/csp-browser-run.ts. The log in
// reports/logs/csp-browser-run.log shows why each host is here; see the report's decisions.
export const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    'https://challenges.cloudflare.com',
    'https://static.cloudflareinsights.com',
  ],
  scriptSrcAttr: ["'none'"],
  // /ops renders sonner's toast stylesheet as an inline <style>: sonner/dist/index.mjs
  // __insertCSS() creates a style element and inserts that CSS, whose sha256 is the StEaX
  // hash below; Chrome also reports the element while it is empty (47DEQ... is sha256 of "").
  // Hashing them keeps style-src free of 'unsafe-inline'.
  styleSrc: [
    "'self'",
    "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='",
    "'sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY='",
  ],
  // React writes inline style attributes; the landing demo relies on them.
  styleSrcAttr: ["'unsafe-inline'"],
  fontSrc: ["'self'"],
  imgSrc: ["'self'"],
  connectSrc: ["'self'", 'wss:', 'https://cloudflareinsights.com'],
  frameSrc: ['https://challenges.cloudflare.com'],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  objectSrc: ["'none'"],
};

// `no-referrer` can break Turnstile's hostname check; strict-origin-when-cross-origin sends
// only the origin across sites, so a confirm token in a path never leaves. Every other
// Hono default stays. `upgrade-insecure-requests` is deliberately absent: it breaks
// http://localhost.
export const securityHeaders = secureHeaders({
  contentSecurityPolicy: CSP_DIRECTIVES,
  referrerPolicy: 'strict-origin-when-cross-origin',
});
