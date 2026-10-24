import { useEffect, useState } from 'react';

export type CopyState = 'idle' | 'copied' | 'failed';

/** Copies text to the clipboard and reports the result for two seconds. */
export function useCopy(): [CopyState, (text: string) => Promise<void>] {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return [state, copy];
}
