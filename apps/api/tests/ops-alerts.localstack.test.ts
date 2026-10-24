/**
 * Story 5.7 — an alert really reaches SNS. Runs against LocalStack with its own topic and a
 * queue subscribed to it (standing in for the ops email subscription), and goes through the
 * real client from src/lib/sns.ts configured by SNS_TOPIC_ARN.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SNSClient, CreateTopicCommand, SubscribeCommand } from '@aws-sdk/client-sns';
import {
  SQSClient,
  CreateQueueCommand,
  GetQueueAttributesCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
} from '@aws-sdk/client-sqs';
import type { OpsNeedsAttention } from '../src/services/ops-feed.js';

const endpoint = process.env.SNS_ENDPOINT ?? process.env.SQS_ENDPOINT;
const config = {
  endpoint,
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
  },
};
const sns = new SNSClient(config);
const sqs = new SQSClient(config);

let queueUrl: string;
let ops: typeof import('../src/services/ops-alerts.js');

beforeAll(async () => {
  const { TopicArn } = await sns.send(new CreateTopicCommand({ Name: 'ticket-needs-attention-test' }));
  const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: 'ticket-needs-attention-test-inbox' }));
  queueUrl = QueueUrl!;
  await sqs.send(new PurgeQueueCommand({ QueueUrl: queueUrl }));
  const attrs = await sqs.send(new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ['QueueArn'] }));
  await sns.send(
    new SubscribeCommand({ TopicArn, Protocol: 'sqs', Endpoint: attrs.Attributes!.QueueArn })
  );

  // The alerter reads its config on first use, so set it before importing.
  process.env.SNS_TOPIC_ARN = TopicArn;
  process.env.SNS_ENDPOINT = endpoint;
  ops = await import('../src/services/ops-alerts.js');
});

afterAll(async () => {
  await sqs.send(new PurgeQueueCommand({ QueueUrl: queueUrl }));
  delete process.env.SNS_TOPIC_ARN;
});

describe('alertNeedsAttention against LocalStack', () => {
  it('delivers the alert to the topic subscribers', async () => {
    const alert: OpsNeedsAttention = {
      ticketId: '00000000-0000-0000-0000-000000000057',
      referenceNumber: 'TICK-SNS-057',
      reason: 'processing_result_missing',
      occurredAt: new Date('2026-10-08T12:00:00.000Z'),
    };

    ops.alertNeedsAttention(alert);
    await ops.pendingAlerts();

    const { Messages } = await sqs.send(
      new ReceiveMessageCommand({ QueueUrl: queueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: 5 })
    );
    expect(Messages).toHaveLength(1);
    const envelope = JSON.parse(Messages![0].Body!);
    const expected = ops.buildAlertMessage(alert);
    expect(envelope.Subject).toBe('[Ticket Pipe] TICK-SNS-057 needs attention (processing_result_missing)');
    expect(envelope.Message).toBe(expected.message);
  });
});
