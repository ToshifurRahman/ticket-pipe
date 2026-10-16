import { useCallback, useEffect, useState } from 'react';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { DEMO_FRAMES, FINAL_FRAME } from './demo-script';

const SEEN_KEY = 'demo-seen';

// Storage can throw (blocked, private mode); the demo then just autoplays as it always did.
function hasSeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // ignore
  }
}

// Plays the script once per tab session and holds on the last frame. Reduced motion, and a
// visitor who already watched it to the end this session, start there.
export function useDemoPlayback() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(() => (hasSeen() ? FINAL_FRAME : 0));
  const [run, setRun] = useState(0);
  const frame = reduced ? FINAL_FRAME : index;

  useEffect(() => {
    if (reduced) return;
    if (index >= FINAL_FRAME) {
      markSeen();
      return;
    }
    const timer = setTimeout(() => setIndex(index + 1), DEMO_FRAMES[index].holdMs);
    return () => clearTimeout(timer);
  }, [reduced, index, run]);

  const replay = useCallback(() => {
    setIndex(0);
    setRun((n) => n + 1);
  }, []);

  return { frame: DEMO_FRAMES[frame], done: frame === FINAL_FRAME, canReplay: !reduced && frame === FINAL_FRAME, replay };
}
