import type { Ply, SupportSide } from '@/lib/ticket-thread';

// A scripted sample ticket for the landing page. Each frame is a state the real ticket page
// can be in; nothing here touches the API.
export type DemoFrame = { plies: Ply[]; support: SupportSide; holdMs: number };

export const DEMO_SUBJECT = 'Charged twice for October';
export const DEMO_REFERENCE = 'TICK-1760000000000-7A4D2C9E';
export const DEMO_MESSAGE = 'My card was charged twice for the October invoice. Can you refund the duplicate?';
export const DEMO_REPLY =
  "Sorry about that, a duplicate charge shouldn't happen. We've flagged the second October payment for a refund to the same card. You'll see it back within a few business days, and we'll confirm here once it's issued.";

const BADGES = { category: 'billing', priority: 'high' };

// Fixed sample times, so the landing page prints the same form for every visitor. Each one
// follows the previous by roughly its stage's hold below, so the live clock and the printed
// times agree.
export const DEMO_TIMES = ['2026-01-01T14:02:07Z', '2026-01-01T14:02:09Z', '2026-01-01T14:02:11Z', '2026-01-01T14:02:13Z'];
const KEYS = ['received', 'triage', 'draft', 'reply'] as const;
const LABELS = [
  ['Received', 'Received', 'Received'],
  ['Triage', 'Triaging', 'Triaged'],
  ['Draft', 'Drafting', 'Drafted'],
  ['Reply', 'Reply', 'Replied'],
];

function plies(done: number, live: number | null): Ply[] {
  return KEYS.map((key, i) => {
    const state = i < done ? 'done' : i === live ? 'live' : 'waiting';
    return {
      n: (i + 1) as Ply['n'],
      key,
      state,
      label: LABELS[i][state === 'done' ? 2 : state === 'live' ? 1 : 0],
      time: state === 'done' ? DEMO_TIMES[i] : null,
    };
  });
}

export const DEMO_FRAMES: DemoFrame[] = [
  { plies: plies(1, 1), support: { kind: 'working', stage: 'reviewing', badges: null }, holdMs: 1800 },
  { plies: plies(2, 2), support: { kind: 'working', stage: 'writing', badges: BADGES }, holdMs: 2400 },
  { plies: plies(3, 3), support: { kind: 'working', stage: 'writing', badges: BADGES }, holdMs: 1400 },
  {
    plies: plies(4, null),
    support: { kind: 'replied', reply: DEMO_REPLY, badges: BADGES, repliedAt: DEMO_TIMES[3] },
    holdMs: 0,
  },
];

export const FINAL_FRAME = DEMO_FRAMES.length - 1;

// Replay tears the copy off: the reply goes first, then the plies clear right to left, one
// stamp at a time, down to the received request the demo starts from.
export const CLEAR_FRAMES: DemoFrame[] = [3, 2, 1].map((done) => ({
  plies: plies(done, null),
  support: DEMO_FRAMES[0].support,
  holdMs: 140,
}));
