import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import pg from 'pg';

import { type Config, type RawEnv, scriptConfig } from '../src/lib/config.js';

const { Client } = pg;

export type MigrateConfig = Pick<Config, 'DATABASE_URL' | 'DATABASE_DIRECT_URL'>;

/**
 * Neon recommends the direct endpoint for migrations; the pooled endpoint lacks the
 * session-level features migration tools rely on. An empty value counts as unset.
 */
export function migrationConnectionString(env?: RawEnv): string {
  const direct = scriptConfig(['DATABASE_DIRECT_URL'], {}, env).DATABASE_DIRECT_URL;
  if (direct) return direct;
  return scriptConfig(['DATABASE_URL'], {}, env).DATABASE_URL;
}

async function migrate(): Promise<void> {
  const client = new Client({ connectionString: migrationConnectionString() });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = join(import.meta.dirname, '../migrations');
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

    const { rows } = await client.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations'
    );
    const applied = new Set(rows.map((r) => r.filename));

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip  ${file}`);
        continue;
      }
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
      console.log(`apply ${file}`);
      ran++;
    }

    if (ran === 0) console.log('nothing to migrate');
  } finally {
    await client.end();
  }
}

if (import.meta.main) await migrate();
