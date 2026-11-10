import { CreateTopicCommand, SNSClient } from '@aws-sdk/client-sns';
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SetQueueAttributesCommand,
  SQSClient,
  type SQSClientConfig,
} from '@aws-sdk/client-sqs';

import { type Config, type RawEnv, scriptConfig } from '../src/lib/config.js';
import { smokeQueueName } from './queue-names.js';

// The local stack uses the placeholder credentials in lib/config.ts. Real AWS must never see
// them: without an endpoint the SDK would sign production requests with "test".
const LOCAL_PLACEHOLDER = 'test';

const KEYS = [
  'SQS_QUEUE_NAME',
  'SQS_DLQ_NAME',
  'SQS_ENDPOINT',
  'SNS_ENDPOINT',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
] as const;

export type SetupConfig = Pick<Config, (typeof KEYS)[number]>;

/** An empty endpoint counts as unset, so `SQS_ENDPOINT=` means real AWS. */
export function hasEndpoint(endpoint: string | undefined): endpoint is string {
  return typeof endpoint === 'string' && endpoint.trim() !== '';
}

/**
 * Reads only the variables this script uses. The schema already requires the AWS keys when
 * SQS_ENDPOINT is unset; here the local placeholder is refused too, so a copy-pasted local
 * .env cannot point this script at production.
 */
export function resolveSetupConfig(env?: RawEnv): SetupConfig {
  const config = scriptConfig(KEYS, {}, env);
  if (!hasEndpoint(config.SQS_ENDPOINT)) {
    for (const name of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'] as const) {
      if (config[name] === LOCAL_PLACEHOLDER) {
        throw new Error(
          `${name} must be a real credential when SQS_ENDPOINT is unset; refusing the local placeholder`
        );
      }
    }
  }
  return config;
}

/** No endpoint property at all for real AWS, which makes the SDK use the regional endpoint. */
export function buildSqsClientConfig(config: SetupConfig): SQSClientConfig {
  return {
    ...(hasEndpoint(config.SQS_ENDPOINT) ? { endpoint: config.SQS_ENDPOINT } : {}),
    region: config.AWS_REGION,
    credentials: {
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    },
  };
}

async function setup(): Promise<void> {
  const config = resolveSetupConfig();
  const queueName = config.SQS_QUEUE_NAME;
  const dlqName = config.SQS_DLQ_NAME;
  const credentials = {
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
  };

  const client = new SQSClient(buildSqsClientConfig(config));

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

  // A dedicated queue for smoke:infra: the worker polls only the main queue, so the probe can
  // never be consumed and deleted as an unknown ticket.
  const smokeResult = await client.send(
    new CreateQueueCommand({ QueueName: smokeQueueName(queueName) })
  );
  if (!smokeResult.QueueUrl) throw new Error('Failed to create smoke queue');
  console.log(`smoke queue created: ${smokeResult.QueueUrl}`);

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
  if (hasEndpoint(config.SNS_ENDPOINT)) {
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
}

if (import.meta.main) await setup();
