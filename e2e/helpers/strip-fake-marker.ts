import pg from 'pg';

// The fake LLM fails a stage on every attempt while its marker is in the description, so a
// replay would fail again. Removing the marker stands in for "the team fixed the cause".

try {
  process.loadEnvFile('.env');
} catch {
  /* no .env: rely on the environment */
}

export async function stripFakeMarkers(ticketId: string): Promise<void> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `UPDATE tickets SET description = trim(regexp_replace(description, '\\[fake:[a-z-]+\\]', '', 'g')) WHERE id = $1`,
      [ticketId]
    );
  } finally {
    await client.end();
  }
}
