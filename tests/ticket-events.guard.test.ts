/**
 * Story 5.3 — ticket history is permanent. Migration 008 makes the database reject changes to
 * `ticket_events`; this guard catches code that tries anyway, before it ever reaches a test DB.
 * Test cleanup goes through tests/helpers/purge-ticket-events.ts, which is outside these dirs.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['src', 'scripts', 'migrations'].map((dir) => path.join(ROOT, dir));
const ALLOWED = path.join(ROOT, 'migrations', '008_ticket_events_append_only.sql');
// The retention purge (the privacy page's 30-day promise) is the one application path that may
// delete history. It opts in per transaction, like the test helper.
const RETENTION = path.join(ROOT, 'src', 'repositories', 'ticket-retention.ts');
const MUTATION = /\b(DELETE\s+FROM|UPDATE|TRUNCATE(\s+TABLE)?)\s+ticket_events\b/i;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|sql)$/.test(full) ? [full] : [];
  });
}

describe('ticket history is append-only', () => {
  it('no application code, script or later migration changes or removes ticket_events rows', () => {
    const offenders = DIRS.flatMap(files)
      .filter((file) => file !== ALLOWED && file !== RETENTION)
      .filter((file) => MUTATION.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('the retention purge is the only application code allowed to delete events', () => {
    expect(readFileSync(RETENTION, 'utf8')).toMatch(MUTATION);
  });

  it('the pattern really matches a mutation (the guard is not vacuous)', () => {
    expect(readFileSync(ALLOWED, 'utf8')).toMatch(MUTATION);
  });
});
