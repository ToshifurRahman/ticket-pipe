import { SQSClient, CreateQueueCommand } from '@aws-sdk/client-sqs';

if (!process.env.SQS_QUEUE_NAME) throw new Error('SQS_QUEUE_NAME is required');
if (!process.env.SQS_ENDPOINT) throw new Error('SQS_ENDPOINT is required');

const client = new SQSClient({
  endpoint: process.env.SQS_ENDPOINT,
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
  },
});

const result = await client.send(
  new CreateQueueCommand({ QueueName: process.env.SQS_QUEUE_NAME })
);
console.log(`queue ready: ${result.QueueUrl}`);
