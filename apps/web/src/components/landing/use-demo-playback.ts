import { useCallback, useEffect, useState } from 'react';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { CLEAR_FRAMES, DEMO_FRAMES, FINAL_FRAME } from './demo-script';

const SEEN_KEY = 'demo-seen';

// Replay clears the finished copy before playing it again; both scripts end on the same frame.
const REPLAY_FRAMES = [...CLEAR_FRAMES, ...DEMO_FRAMES];

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
  const [script, setScript] = useState(DEMO_FRAMES);
  const [index, setIndex] = useState(() => (hasSeen() ? FINAL_FRAME : 0));
  const [run, setRun] = useState(0);
  const last = script.length - 1;
  const frame = reduced ? DEMO_FRAMES[FINAL_FRAME] : script[index];
  const done = reduced || index === last;

  useEffect(() => {
    if (reduced) return;
    if (index >= last) {
      markSeen();
      return;
    }
    const timer = setTimeout(() => setIndex(index + 1), script[index].holdMs);
    return () => clearTimeout(timer);
  }, [reduced, script, last, index, run]);

  const replay = useCallback(() => {
    setScript(REPLAY_FRAMES);
    setIndex(0);
    setRun((n) => n + 1);
  }, []);

  return { frame, done, canReplay: !reduced && done, replay };
}
