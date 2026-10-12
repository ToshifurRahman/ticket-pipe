import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia?.(QUERY);
  list?.addEventListener?.('change', onChange);
  return () => list?.removeEventListener?.('change', onChange);
}

const read = () => window.matchMedia?.(QUERY).matches ?? false;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
