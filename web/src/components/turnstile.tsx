import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useTheme } from '@/hooks/use-theme';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// Cloudflare's documented always-pass key for development and tests.
const TEST_SITE_KEY = '1x00000000000000000000AA';

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || TEST_SITE_KEY;

export type TurnstileHandle = { reset: () => void };

let scriptPromise: Promise<void> | null = null;

// One script tag for the whole app; a failed load is forgotten so a later mount can retry.
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      script.remove();
      reject(new Error('Turnstile failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

// Cloudflare's script is third-party work that competes with the first paint. Waiting for the
// browser to go idle keeps it off the critical path; a visitor needs seconds to fill the form.
function whenIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(callback, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, 0);
  return () => window.clearTimeout(id);
}

type TurnstileProps = {
  /** Called with a fresh token, or null when the token expires, errors or is reset. */
  onToken: (token: string | null) => void;
  ref?: Ref<TurnstileHandle>;
};

/** The bot check. Server-side verification of the token lands in 7.5. */
export function Turnstile({ onToken, ref }: TurnstileProps) {
  const { theme } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useImperativeHandle(ref, () => ({
    reset() {
      onTokenRef.current(null);
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    },
  }));

  // Re-rendered on a theme flip: Turnstile has no API to restyle a live widget.
  useEffect(() => {
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      loadScript().then(
        () => {
          if (cancelled || !container.current || !window.turnstile) return;
          setFailed(false);
          widgetId.current = window.turnstile.render(container.current, {
            sitekey: TURNSTILE_SITE_KEY,
            theme,
            callback: (token) => onTokenRef.current(token),
            'expired-callback': () => onTokenRef.current(null),
            'error-callback': () => onTokenRef.current(null),
          });
        },
        () => {
          if (!cancelled) setFailed(true);
        }
      );
    });
    return () => {
      cancelled = true;
      cancelIdle();
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
      onTokenRef.current(null);
    };
  }, [theme]);

  return (
    <div className="min-h-(--captcha-height)">
      <div ref={container} />
      {failed && (
        <p role="alert" className="text-xs text-destructive">
          The verification check couldn't load. Check your connection and reload the page.
        </p>
      )}
    </div>
  );
}
