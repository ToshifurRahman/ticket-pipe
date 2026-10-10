import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

function current(): Theme {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

// The <html> class is the single source of truth, so every component using this hook (the
// header toggle, the Turnstile widget) sees a flip made by any other.
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

// The inline script in index.html has already applied the saved theme; this only reads it
// back and flips it. Dark is the default, so only "light" is ever worth persisting.
export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, current);

  const toggle = useCallback(() => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(next);
    root.style.colorScheme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* storage unavailable: the choice just won't survive a reload */
    }
  }, []);

  return { theme, toggle };
}
