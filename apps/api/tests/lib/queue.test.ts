import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  SQSClient,
  CreateQueueCommand,
  DeleteQueueCommand,
  PurgeQueueCommand,
  GetQueueUrlCommand,
} from '@aws-sdk/client-sqs';
import { enqueueTicket, receiveMessages, deleteMessage } from '../../src/lib/queue.js';

const client = new SQSClient({
  endpoint: process.env.SQS_ENDPOINT,
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
  },
});

const queueName = process.env.SQS_QUEUE_NAME ?? 'ticket-processing';

let queueUrl: string;

beforeAll(async () => {
  await client.send(new CreateQueueCommand({ QueueName: queueName }));
  const { QueueUrl } = await client.send(new GetQueueUrlCommand({ QueueName: queueName }));
  queueUrl = QueueUrl!;
  await client.send(new PurgeQueueCommand({ QueueUrl: queueUrl }));
});

afterAll(async () => {
  await client.send(new PurgeQueueCommand({ QueueUrl: queueUrl }));
});

describe('enqueueTicket', () => {
  it('puts a message on the queue without throwing', async () => {
    await expect(
      enqueueTicket('00000000-0000-0000-0000-000000000001', 'TICK-QUEUE-001')
    ).resolves.not.toThrow();
  });
});

describe('receiveMessages + deleteMessage', () => {
  it('receives the enqueued message and deletes it', async () => {
    const ticketId = '00000000-0000-0000-0000-000000000002';
    const refNumber = 'TICK-QUEUE-002';

    await enqueueTicket(ticketId, refNumber);

    const messages = await receiveMessages();
    const msg = messages.find(m => m.ticketId === ticketId);

    expect(msg).toBeDefined();
    expect(msg!.ticketId).toBe(ticketId);
    expect(msg!.referenceNumber).toBe(refNumber);
    expect(typeof msg!.receiptHandle).toBe('string');

    await deleteMessage(msg!.receiptHandle);

    // Message should not come back after deletion
    const after = await receiveMessages();
    const reappeared = after.find(m => m.ticketId === ticketId);
    expect(reappeared).toBeUndefined();
  });
});

describe('queue disappears after its URL was cached', () => {
  it('fails while the queue is missing and recovers once it is back', async () => {
    await enqueueTicket('00000000-0000-0000-0000-000000000003', 'TICK-QUEUE-003');

    await client.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
    await expect(enqueueTicket('00000000-0000-0000-0000-000000000004', 'TICK-QUEUE-004')).rejects.toMatchObject({
      name: 'QueueDoesNotExist',
    });

    await client.send(new CreateQueueCommand({ QueueName: queueName }));
    await expect(enqueueTicket('00000000-0000-0000-0000-000000000005', 'TICK-QUEUE-005')).resolves.toBeUndefined();
  });
});
