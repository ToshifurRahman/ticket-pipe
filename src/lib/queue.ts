import {
  SQSClient,
  SendMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';

const client = new SQSClient({
  endpoint: process.env.SQS_ENDPOINT,
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
  },
});

async function getQueueUrl(): Promise<string> {
  const queueName = process.env.SQS_QUEUE_NAME;
  if (!queueName) throw new Error('SQS_QUEUE_NAME environment variable is required');

  const result = await client.send(new GetQueueUrlCommand({ QueueName: queueName }));
  if (!result.QueueUrl) throw new Error(`Queue not found: ${queueName}`);
  return result.QueueUrl;
}

export async function enqueueTicket(ticketId: string, referenceNumber: string): Promise<void> {
  const queueUrl = await getQueueUrl();
  await client.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({ ticketId, referenceNumber }),
    })
  );
}

export interface QueueMessage {
  ticketId: string;
  referenceNumber: string;
  receiptHandle: string;
}

export async function receiveMessages(): Promise<QueueMessage[]> {
  const queueUrl = await getQueueUrl();
  const result = await client.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,
    })
  );
  return (result.Messages ?? []).map(m => ({
    ...JSON.parse(m.Body!),
    receiptHandle: m.ReceiptHandle!,
  }));
}

export async function deleteMessage(receiptHandle: string): Promise<void> {
  const queueUrl = await getQueueUrl();
  await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }));
}
