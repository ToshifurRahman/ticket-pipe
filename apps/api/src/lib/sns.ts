import { SNSClient } from '@aws-sdk/client-sns';

export interface SnsTarget {
  client: SNSClient;
  topicArn: string;
}

// Short timeouts and a single retry: alerts are best-effort, and a hung call should give up
// quickly instead of piling up in the background of a busy worker.
const REQUEST_TIMEOUT_MS = 5000;
const CONNECTION_TIMEOUT_MS = 2000;
const MAX_ATTEMPTS = 2;

let target: SnsTarget | null | undefined;

// Ops alerts are optional. Without SNS_TOPIC_ARN (local dev, CI, or after the AWS free plan
// ends) this returns null and callers skip the alert. SNS_ENDPOINT points at LocalStack; when
// unset the SDK talks to real AWS. Built on first use so importing this module never throws.
export function getSnsClient(): SnsTarget | null {
  if (target !== undefined) return target;

  const topicArn = process.env.SNS_TOPIC_ARN;
  if (!topicArn) {
    target = null;
    return target;
  }

  const client = new SNSClient({
    endpoint: process.env.SNS_ENDPOINT,
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
    },
    maxAttempts: MAX_ATTEMPTS,
    requestHandler: { requestTimeout: REQUEST_TIMEOUT_MS, connectionTimeout: CONNECTION_TIMEOUT_MS },
  });
  target = { client, topicArn };
  return target;
}
