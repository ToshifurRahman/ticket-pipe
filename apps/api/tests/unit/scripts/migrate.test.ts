import { describe, expect, it } from 'vitest';

import { migrationConnectionString } from '../../../scripts/migrate.js';

const DIRECT = 'postgresql://user:fake-secret-value@direct.example:5432/ticket_pipe';
const POOLED = 'postgresql://user:fake-secret-value@pooled.example:5432/ticket_pipe';

describe('migrate connection URL', () => {
  it('prefers DATABASE_DIRECT_URL when it is set', () => {
    expect(migrationConnectionString({ DATABASE_URL: POOLED, DATABASE_DIRECT_URL: DIRECT })).toBe(
      DIRECT
    );
  });

  it('needs only the direct URL when that is all that is configured', () => {
    expect(migrationConnectionString({ DATABASE_DIRECT_URL: DIRECT })).toBe(DIRECT);
  });

  it('falls back to DATABASE_URL when the direct URL is absent', () => {
    expect(migrationConnectionString({ DATABASE_URL: POOLED })).toBe(POOLED);
  });

  it('treats an empty direct URL as unset', () => {
    expect(migrationConnectionString({ DATABASE_URL: POOLED, DATABASE_DIRECT_URL: '' })).toBe(
      POOLED
    );
  });
});
