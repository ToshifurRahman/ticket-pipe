import { randomBytes } from 'crypto';

export function generateReferenceNumber(): string {
  const ts = Date.now();
  const hex = randomBytes(4).toString('hex').toUpperCase();
  return `TICK-${ts}-${hex}`;
}
