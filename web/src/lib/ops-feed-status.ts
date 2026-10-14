// Whether the console's live feed is connected, for the header indicator. A module-level
// store because the header sits in the layout while the feed runs inside the page.
export type FeedState = 'connecting' | 'connected' | 'offline';

let state: FeedState = 'offline';
const listeners = new Set<() => void>();

export function setFeedState(next: FeedState): void {
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener();
}

export const getFeedState = (): FeedState => state;

export function subscribeFeedState(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
