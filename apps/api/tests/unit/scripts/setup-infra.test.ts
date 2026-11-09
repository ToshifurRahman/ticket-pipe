import { describe, expect, it } from 'vitest';

import { buildSqsClientConfig, resolveSetupConfig } from '../../../scripts/setup-infra.js';

const REAL = {
  SQS_QUEUE_NAME: 'ticket-processing-production',
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'fake-access-key-id',
  AWS_SECRET_ACCESS_KEY: 'fake-secret-value',
};

describe('setup-infra real AWS path', () => {
  it('passes no endpoint when SQS_ENDPOINT is unset', () => {
    const config = resolveSetupConfig(REAL);
    expect(config.SQS_ENDPOINT).toBeUndefined();
    expect(buildSqsClientConfig(config)).not.toHaveProperty('endpoint');
  });

  it('treats an empty SQS_ENDPOINT as unset', () => {
    const config = resolveSetupConfig({ ...REAL, SQS_ENDPOINT: '' });
    expect(config.SQS_ENDPOINT).toBeUndefined();
    expect(buildSqsClientConfig(config)).not.toHaveProperty('endpoint');
  });

  it.each(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'])(
    'refuses the local placeholder in %s against real AWS',
    (key) => {
      expect(() => resolveSetupConfig({ ...REAL, [key]: 'test' })).toThrow(key);
    }
  );

  it('keeps the local endpoint path working, placeholders included', () => {
    const config = resolveSetupConfig({
      SQS_QUEUE_NAME: 'tickets',
      AWS_REGION: 'us-east-1',
      SQS_ENDPOINT: 'http://localhost:4566',
    });
    expect(config.AWS_ACCESS_KEY_ID).toBe('test');
    expect(buildSqsClientConfig(config)).toMatchObject({
      endpoint: 'http://localhost:4566',
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
  });

  it('treats an empty SNS_ENDPOINT as unset, so no topic is created there', () => {
    const config = resolveSetupConfig({ ...REAL, SNS_ENDPOINT: '' });
    expect(config.SNS_ENDPOINT).toBeUndefined();
  });

  it('does not leak the secret in the refusal message', () => {
    try {
      resolveSetupConfig({ ...REAL, AWS_SECRET_ACCESS_KEY: 'test' });
      throw new Error('expected a refusal');
    } catch (err) {
      expect((err as Error).message).not.toContain('fake-secret-value');
    }
  });
});
