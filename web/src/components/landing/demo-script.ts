import type { Step, SupportSide } from '@/lib/ticket-thread';

// A scripted sample ticket for the landing page. Each frame is a state the real ticket page
// can be in; nothing here touches the API.
export type DemoFrame = { steps: Step[]; support: SupportSide; holdMs: number };

export const DEMO_SUBJECT = 'Charged twice for October';
export const DEMO_REFERENCE = 'TICK-1760000000000-7A4D2C9E';
export const DEMO_MESSAGE = 'My card was charged twice for the October invoice. Can you refund the duplicate?';
export const DEMO_REPLY =
  'Sorry about that — a duplicate charge shouldn’t happen. We’ve flagged the second October payment for a refund to the same card. You’ll see it back within a few business days, and we’ll confirm here once it’s issued.';

const BADGES = { category: 'billing', priority: 'high' };

function steps(done: number, active: number | null): Step[] {
  return ['Received', 'Triaged', 'Drafted', 'Replied'].map((label, i) => ({
    label,
    state: i < done ? 'done' : i === active ? 'active' : 'idle',
  }));
}

export const DEMO_FRAMES: DemoFrame[] = [
  { steps: steps(1, 1), support: { kind: 'working', stage: 'reviewing', badges: null }, holdMs: 1800 },
  { steps: steps(2, 2), support: { kind: 'working', stage: 'writing', badges: BADGES }, holdMs: 2400 },
  { steps: steps(3, 3), support: { kind: 'working', stage: 'writing', badges: BADGES }, holdMs: 1400 },
  {
    steps: steps(4, null),
    support: { kind: 'replied', reply: DEMO_REPLY, badges: BADGES, repliedAt: null },
    holdMs: 0,
  },
];

export const FINAL_FRAME = DEMO_FRAMES.length - 1;
