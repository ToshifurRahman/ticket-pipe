import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

type Phase = 'set' | 'blank' | 'running';

type Options = {
  /** Share of the element that must be in view. */
  threshold?: number;
  /** Utility class for the one-shot animation. */
  animation?: string;
  /** Hold before the animation starts, so siblings land one after another. */
  delayMs?: number;
};

/**
 * Plays a one-shot animation the first time an element is mostly in view (a stamp by
 * default). It only blanks out when it starts below the fold, so a deep link, reduced motion
 * or a browser without IntersectionObserver shows it already set.
 */
export function useStampOnView<T extends HTMLElement>({
  threshold = 0.6,
  animation = 'animate-stamp-press',
  delayMs = 0,
}: Options = {}) {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('set');

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reduced || typeof IntersectionObserver === 'undefined') return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    setPhase('blank');
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setPhase('running');
        observer.disconnect();
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced, threshold]);

  const className = phase === 'blank' ? 'opacity-0' : phase === 'running' ? animation : undefined;
  const style: CSSProperties | undefined = phase === 'running' && delayMs ? { animationDelay: `${delayMs}ms` } : undefined;
  return { ref, className, style };
}
