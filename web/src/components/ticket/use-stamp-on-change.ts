import { useState } from 'react';

/**
 * Counts how often each value changed since the first render. A cell uses its count in its
 * `key` and plays the stamp only when the count is above zero, so a page that loads already
 * mid-flight stays still and only a stage that lands afterwards is stamped.
 */
export function useStampOnChange(values: Record<string, string>): Record<string, number> {
  const [seen, setSeen] = useState({ values, counts: {} as Record<string, number> });

  const changed = Object.keys(values).filter((k) => seen.values[k] !== values[k]);
  if (changed.length > 0) {
    const counts = { ...seen.counts };
    for (const k of changed) counts[k] = (counts[k] ?? 0) + 1;
    setSeen({ values, counts });
    return counts;
  }
  return seen.counts;
}

/** The class and key for a cell that stamps when its value changes. */
export function stampProps(counts: Record<string, number>, id: string) {
  const n = counts[id] ?? 0;
  return { key: `${id}-${n}`, className: n > 0 ? 'animate-stamp' : undefined };
}
