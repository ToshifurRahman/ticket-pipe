import { CreateQueueCommand, DeleteQueueCommand, SQSClient } from '@aws-sdk/client-sqs';

function client(): SQSClient {
  return new SQSClient({
    endpoint: process.env.SQS_ENDPOINT,
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
    },
  });
}

export function uniqueQueueName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function createTestQueue(name: string): Promise<string> {
  const result = await client().send(new CreateQueueCommand({ QueueName: name }));
  if (!result.QueueUrl) throw new Error(`Queue not created: ${name}`);
  return result.QueueUrl;
}

export async function deleteTestQueue(queueUrl: string): Promise<void> {
  await client().send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
}
