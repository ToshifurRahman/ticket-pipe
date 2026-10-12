import { useCallback, useEffect, useState } from 'react';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { DEMO_FRAMES, FINAL_FRAME } from './demo-script';

// Plays the script once and holds on the last frame. Reduced motion starts there.
export function useDemoPlayback() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [run, setRun] = useState(0);
  const frame = reduced ? FINAL_FRAME : index;

  useEffect(() => {
    if (reduced || index >= FINAL_FRAME) return;
    const timer = setTimeout(() => setIndex(index + 1), DEMO_FRAMES[index].holdMs);
    return () => clearTimeout(timer);
  }, [reduced, index, run]);

  const replay = useCallback(() => {
    setIndex(0);
    setRun((n) => n + 1);
  }, []);

  return { frame: DEMO_FRAMES[frame], done: frame === FINAL_FRAME, canReplay: !reduced && frame === FINAL_FRAME, replay };
}
