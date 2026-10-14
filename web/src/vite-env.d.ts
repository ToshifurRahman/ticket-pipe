/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Cloudflare Turnstile site key. Unset → Cloudflare's always-pass test key. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  /** Cloudflare Web Analytics token. Unset → no beacon, even in a production build. */
  readonly VITE_CF_ANALYTICS_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type TurnstileRenderOptions = {
  sitekey: string;
  theme?: 'light' | 'dark' | 'auto';
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
};

interface Window {
  turnstile?: {
    render(container: HTMLElement, options: TurnstileRenderOptions): string;
    reset(widgetId: string): void;
    remove(widgetId: string): void;
  };
}
