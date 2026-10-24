import { useEffect, useState } from 'react';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

const EVENTS = ['scroll', 'pointerdown', 'keydown', 'touchstart'] as const;

/**
 * If nobody has touched the page after a few seconds, the button presses itself down twice.
 * Any scroll, pointer or key event cancels it for good.
 */
export function useIdleNudge(afterMs = 6000) {
  const reduced = useReducedMotion();
  const [nudging, setNudging] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const calm = () => {
      clearTimeout(idle);
      setNudging(false);
      EVENTS.forEach((e) => removeEventListener(e, calm));
    };
    const idle = setTimeout(() => setNudging(true), afterMs);
    EVENTS.forEach((e) => addEventListener(e, calm, { passive: true }));
    return calm;
  }, [reduced, afterMs]);

  return { className: nudging ? 'animate-nudge' : undefined, onAnimationEnd: () => setNudging(false) };
}
