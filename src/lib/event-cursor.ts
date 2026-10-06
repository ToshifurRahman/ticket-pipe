/**
 * Pagination cursors for ticket history. A cursor wraps an event's `seq`, but clients must
 * treat it as opaque: the `v1:` prefix leaves room to change what's inside later.
 */
const PREFIX = 'v1:';

export function encodeEventCursor(seq: number): string {
  return Buffer.from(`${PREFIX}${seq}`, 'utf8').toString('base64url');
}

/** Returns the `seq` inside a cursor, or null if the cursor is malformed. */
export function decodeEventCursor(cursor: string): number | null {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!decoded.startsWith(PREFIX)) return null;
  const digits = decoded.slice(PREFIX.length);
  if (!/^\d{1,15}$/.test(digits)) return null;
  const seq = Number(digits);
  // Buffer decoding skips characters it doesn't recognise, so only accept the exact
  // string we would have issued ourselves.
  return encodeEventCursor(seq) === cursor ? seq : null;
}
