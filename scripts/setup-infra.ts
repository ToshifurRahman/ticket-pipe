import {
  SQSClient,
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';

if (!process.env.SQS_QUEUE_NAME) throw new Error('SQS_QUEUE_NAME is required');
if (!process.env.SQS_ENDPOINT) throw new Error('SQS_ENDPOINT is required');

const queueName = process.env.SQS_QUEUE_NAME;
const dlqName = process.env.SQS_DLQ_NAME ?? `${queueName}-dlq`;

const client = new SQSClient({
  endpoint: process.env.SQS_ENDPOINT,
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
  },
});

// Create DLQ first
const dlqResult = await client.send(new CreateQueueCommand({ QueueName: dlqName }));
if (!dlqResult.QueueUrl) throw new Error('Failed to create DLQ');
console.log(`DLQ created: ${dlqResult.QueueUrl}`);

// Get DLQ ARN
const dlqAttrs = await client.send(
  new GetQueueAttributesCommand({
    QueueUrl: dlqResult.QueueUrl,
    AttributeNames: ['QueueArn'],
  })
);
const dlqArn = dlqAttrs.Attributes?.QueueArn;
if (!dlqArn) throw new Error('Failed to retrieve DLQ ARN');
console.log(`DLQ ARN: ${dlqArn}`);

// Create main queue
const mainResult = await client.send(new CreateQueueCommand({ QueueName: queueName }));
if (!mainResult.QueueUrl) throw new Error('Failed to create main queue');
console.log(`main queue created: ${mainResult.QueueUrl}`);

// Apply redrive policy
await client.send(
  new SetQueueAttributesCommand({
    QueueUrl: mainResult.QueueUrl,
    Attributes: {
      RedrivePolicy: JSON.stringify({
        deadLetterTargetArn: dlqArn,
        maxReceiveCount: '10',
      }),
    },
  })
);
console.log('redrive policy applied');
console.log(`setup complete: main queue ${mainResult.QueueUrl}, DLQ ${dlqResult.QueueUrl}`);
