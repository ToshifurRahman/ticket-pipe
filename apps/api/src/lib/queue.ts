import {
  SQSClient,
  SendMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  MessageSystemAttributeName,
} from '@aws-sdk/client-sqs';

export interface QueueMessage {
  ticketId: string;
  referenceNumber: string;
  receiptHandle: string;
  attemptNumber: number;
}

export interface ReceiveMessagesOptions {
  maxMessages?: number;
  waitTimeSeconds?: number;
}

function isQueueMissing(err: unknown): boolean {
  const e = err as { name?: string; Code?: string } | null;
  return e?.name === 'QueueDoesNotExist' || e?.Code === 'AWS.SimpleQueueService.NonExistentQueue';
}

function normalizeMaxMessages(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 10;
  return Math.min(10, Math.max(1, Math.floor(value)));
}

function normalizeWaitTimeSeconds(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 20;
  return Math.min(20, Math.max(0, Math.floor(value)));
}

export class QueueService {
  private queueUrl: string | null = null;

  constructor(
    private readonly client: SQSClient,
    private readonly queueName: string
  ) {}

  private async getQueueUrl(): Promise<string> {
    if (this.queueUrl) return this.queueUrl;
    const result = await this.client.send(new GetQueueUrlCommand({ QueueName: this.queueName }));
    if (!result.QueueUrl) throw new Error(`Queue not found: ${this.queueName}`);
    this.queueUrl = result.QueueUrl;
    return this.queueUrl;
  }

  // The queue can vanish (LocalStack recreated, queue deleted) after its URL was cached. Drop the
  // cache and resolve again once; if the queue is still missing the error reaches the caller, which
  // owns the backoff.
  private async withQueueUrl<T>(call: (queueUrl: string) => Promise<T>): Promise<T> {
    try {
      return await call(await this.getQueueUrl());
    } catch (err) {
      if (!isQueueMissing(err)) throw err;
      this.queueUrl = null;
      return call(await this.getQueueUrl());
    }
  }

  async enqueue(ticketId: string, referenceNumber: string): Promise<void> {
    await this.withQueueUrl(queueUrl =>
      this.client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({ ticketId, referenceNumber }),
        })
      )
    );
  }

  async receive(options: ReceiveMessagesOptions = {}): Promise<QueueMessage[]> {
    const maxMessages = normalizeMaxMessages(options.maxMessages);
    const waitTimeSeconds = normalizeWaitTimeSeconds(options.waitTimeSeconds);
    const result = await this.withQueueUrl(queueUrl =>
      this.client.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: maxMessages,
          WaitTimeSeconds: waitTimeSeconds,
          MessageSystemAttributeNames: [MessageSystemAttributeName.ApproximateReceiveCount],
        })
      )
    );
    return (result.Messages ?? []).map(m => ({
      ...JSON.parse(m.Body!),
      receiptHandle: m.ReceiptHandle!,
      attemptNumber: Number(m.Attributes?.ApproximateReceiveCount ?? '1'),
    }));
  }

  async delete(receiptHandle: string): Promise<void> {
    await this.withQueueUrl(queueUrl =>
      this.client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }))
    );
  }
}

if (!process.env.SQS_QUEUE_NAME) throw new Error('SQS_QUEUE_NAME environment variable is required');

const queueService = new QueueService(
  new SQSClient({
    endpoint: process.env.SQS_ENDPOINT,
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
    },
  }),
  process.env.SQS_QUEUE_NAME
);

export const enqueueTicket = (ticketId: string, referenceNumber: string): Promise<void> =>
  queueService.enqueue(ticketId, referenceNumber);

export const receiveMessages = (options?: ReceiveMessagesOptions): Promise<QueueMessage[]> =>
  queueService.receive(options);

export const deleteMessage = (receiptHandle: string): Promise<void> =>
  queueService.delete(receiptHandle);
