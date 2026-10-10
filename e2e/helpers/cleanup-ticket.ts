import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import pg from 'pg';

// Removes a ticket an e2e test created. The e2e stack's worker normally processes it, but a
// ticket still queued when the test ends would otherwise wait in the dev queue for a
// real-mode worker to spend an LLM call on it. So an unfinished ticket's message is drained
// first (other messages are handed straight back), then the rows are deleted.

try {
  process.loadEnvFile('.env');
} catch {
  /* no .env: rely on the environment */
}

const FINISHED = new Set(['completed', 'failed', 'needs_attention']);

export async function removeTicket(ticketId: string): Promise<void> {
  if (!FINISHED.has(await ticketStatus(ticketId))) await drainMessage(ticketId);
  await deleteRows(ticketId);
}

async function ticketStatus(ticketId: string): Promise<string> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ status: string }>('SELECT status FROM tickets WHERE id = $1', [ticketId]);
    return rows[0]?.status ?? 'completed';
  } finally {
    await client.end();
  }
}

async function drainMessage(ticketId: string): Promise<void> {
  const sqs = new SQSClient({
    endpoint: process.env.SQS_ENDPOINT,
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
    },
  });
  try {
    const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: process.env.SQS_QUEUE_NAME }));
    for (let round = 0; round < 5; round++) {
      const { Messages = [] } = await sqs.send(
        new ReceiveMessageCommand({ QueueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: 1 })
      );
      let found = false;
      for (const m of Messages) {
        const mine = (JSON.parse(m.Body ?? '{}') as { ticketId?: string }).ticketId === ticketId;
        found ||= mine;
        await sqs.send(
          mine
            ? new DeleteMessageCommand({ QueueUrl, ReceiptHandle: m.ReceiptHandle })
            : new ChangeMessageVisibilityCommand({ QueueUrl, ReceiptHandle: m.ReceiptHandle, VisibilityTimeout: 0 })
        );
      }
      if (found) return;
    }
  } finally {
    sqs.destroy();
  }
}

async function deleteRows(ticketId: string): Promise<void> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    // ticket_events is append-only (migration 008); this transaction-local flag allows cleanup.
    await client.query("SELECT set_config('app.allow_event_purge', 'on', true)");
    await client.query('DELETE FROM ticket_events WHERE ticket_id = $1', [ticketId]);
    await client.query('DELETE FROM ticket_processing WHERE ticket_id = $1', [ticketId]);
    await client.query('DELETE FROM ai_interactions WHERE ticket_id = $1', [ticketId]);
    await client.query('DELETE FROM tickets WHERE id = $1', [ticketId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}
