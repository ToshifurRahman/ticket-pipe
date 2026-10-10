import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import pg from 'pg';

// The e2e server runs no worker yet (6.3 adds one), so a ticket submitted here would sit in
// the dev queue until a real-mode worker spent an LLM call on it. Remove it instead: drain its
// message, then delete its rows. Other messages are handed straight back to the queue.

try {
  process.loadEnvFile('.env');
} catch {
  /* no .env: rely on the environment */
}

export async function removeTicket(ticketId: string): Promise<void> {
  await drainMessage(ticketId);
  await deleteRows(ticketId);
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
