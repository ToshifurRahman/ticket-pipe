import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { sourceFiles } from '../helpers/source-files.js';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const SRC = path.resolve(import.meta.dirname, '../../src');
const RUNTIME_POLICY = path.join(ROOT, 'infra/iam/runtime-policy.json');
const SETUP_POLICY = path.join(ROOT, 'infra/iam/setup-policy.json');

interface Policy {
  Statement: Array<{ Action: string | string[]; Resource: string | string[] }>;
}

function load(file: string): Policy {
  return JSON.parse(readFileSync(file, 'utf8')) as Policy;
}

function values(policy: Policy): string[] {
  return policy.Statement.flatMap((statement) => [
    ...(Array.isArray(statement.Action) ? statement.Action : [statement.Action]),
    ...(Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource]),
  ]);
}

// The Command class of every SQS/SNS import under apps/api/src, mapped to its IAM action.
const ACTIONS: Record<string, string> = {
  'sqs:GetQueueUrl': 'sqs:GetQueueUrl',
  'sqs:SendMessage': 'sqs:SendMessage',
  'sqs:ReceiveMessage': 'sqs:ReceiveMessage',
  'sqs:DeleteMessage': 'sqs:DeleteMessage',
  'sqs:ChangeMessageVisibility': 'sqs:ChangeMessageVisibility',
  'sns:Publish': 'sns:Publish',
};

function runtimeActionsFromSource(): Set<string> {
  const imports = sourceFiles(SRC)
    .map((file) => readFileSync(file, 'utf8'))
    .flatMap((source) => [
      ...source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*'@aws-sdk\/client-(sqs|sns)'/g),
    ]);

  const actions = new Set<string>();
  for (const [, names, service] of imports) {
    for (const name of names.split(',').map((part) => part.trim())) {
      if (!name.endsWith('Command')) continue;
      const action = `${service}:${name.slice(0, -'Command'.length)}`;
      if (!(action in ACTIONS)) {
        throw new Error(`No IAM action mapping for ${name}`);
      }
      actions.add(action);
    }
  }
  return actions;
}

describe('IAM policies', () => {
  it('the runtime policy lists exactly the actions the runtime code imports', () => {
    const policy = load(RUNTIME_POLICY);
    const actions = policy.Statement.flatMap((statement) =>
      Array.isArray(statement.Action) ? statement.Action : [statement.Action]
    );
    expect([...new Set(actions)].sort()).toEqual([...runtimeActionsFromSource()].sort());
  });

  it('has no wildcard action or resource in either policy', () => {
    for (const file of [RUNTIME_POLICY, SETUP_POLICY]) {
      for (const value of values(load(file))) {
        expect(value, `${path.basename(file)}: ${value}`).not.toContain('*');
      }
    }
  });

  it('uses only named ARNs with the documented placeholders', () => {
    for (const file of [RUNTIME_POLICY, SETUP_POLICY]) {
      for (const value of values(load(file))) {
        if (value.startsWith('sqs:') || value.startsWith('sns:')) continue;
        expect(value).toMatch(/^arn:aws:(sqs|sns):<region>:<account-id>:<[a-z-]+>$/);
      }
    }
  });

  it('the runtime policy publishes to the one topic and the queues, never SNS admin', () => {
    const actions = load(RUNTIME_POLICY).Statement.flatMap((statement) =>
      Array.isArray(statement.Action) ? statement.Action : [statement.Action]
    );
    expect(actions).toContain('sns:Publish');
    expect(actions).not.toContain('sns:CreateTopic');
    expect(actions.every((action) => action.startsWith('sqs:') || action === 'sns:Publish')).toBe(
      true
    );
  });

  it('both policies cover the dedicated smoke queue', () => {
    for (const file of [RUNTIME_POLICY, SETUP_POLICY]) {
      expect(values(load(file)).join('\n')).toContain('<smoke-queue>');
    }
  });
});
