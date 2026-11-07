import { CreateTopicCommand, SNSClient } from '@aws-sdk/client-sns';
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SetQueueAttributesCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';

import { scriptConfig } from '../src/lib/config.js';

const config = scriptConfig(
  [
    'SQS_QUEUE_NAME',
    'SQS_DLQ_NAME',
    'SQS_ENDPOINT',
    'SNS_ENDPOINT',
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
  ],
  { required: ['SQS_ENDPOINT'] }
);

const queueName = config.SQS_QUEUE_NAME;
const dlqName = config.SQS_DLQ_NAME;
const credentials = {
  accessKeyId: config.AWS_ACCESS_KEY_ID,
  secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
};

const client = new SQSClient({
  endpoint: config.SQS_ENDPOINT,
  region: config.AWS_REGION,
  credentials,
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
if (config.SNS_ENDPOINT) {
  const sns = new SNSClient({
    endpoint: config.SNS_ENDPOINT,
    region: config.AWS_REGION,
    credentials,
  });
  const topic = await sns.send(new CreateTopicCommand({ Name: 'ticket-needs-attention' }));
  if (!topic.TopicArn) throw new Error('Failed to create SNS topic');
  console.log(
    `SNS topic created: ${topic.TopicArn} (set SNS_TOPIC_ARN to this to turn on ops alerts)`
  );
} else {
  console.log('SNS_ENDPOINT not set, skipping the ops alert topic');
}
