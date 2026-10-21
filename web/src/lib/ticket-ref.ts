// Reference numbers come from the API as TICK-<13-digit ms timestamp>-<8 hex>.
const REF_PATTERN = /^TICK-\d{13}-[0-9A-F]{8}$/;

export const REF_EXAMPLE = 'TICK-1760000000000-7A4D2C9E';

export function normalizeRef(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidRef(input: string): boolean {
  return REF_PATTERN.test(normalizeRef(input));
}
