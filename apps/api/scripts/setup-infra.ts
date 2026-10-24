import {
  SQSClient,
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';
import { SNSClient, CreateTopicCommand } from '@aws-sdk/client-sns';

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

// SNS topic for ops email alerts (story 5.7). Only against a local endpoint: in AWS the topic
// and its email subscription are created by hand (story 7.8), never by this script.
if (process.env.SNS_ENDPOINT) {
  const sns = new SNSClient({
    endpoint: process.env.SNS_ENDPOINT,
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
    },
  });
  const topic = await sns.send(new CreateTopicCommand({ Name: 'ticket-needs-attention' }));
  if (!topic.TopicArn) throw new Error('Failed to create SNS topic');
  console.log(`SNS topic created: ${topic.TopicArn} (set SNS_TOPIC_ARN to this to turn on ops alerts)`);
} else {
  console.log('SNS_ENDPOINT not set, skipping the ops alert topic');
}
