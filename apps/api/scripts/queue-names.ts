// SQS names are at most 80 characters from [A-Za-z0-9_-]. Setup also creates `<name>-dlq` and
// `<name>-smoke`, so the main name has to leave room for the longer suffix; the schema, setup
// and the smoke check all use these helpers.
export const SQS_NAME_MAX_LENGTH = 80;
export const SQS_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
export const SQS_DLQ_SUFFIX = '-dlq';
export const SQS_SMOKE_SUFFIX = '-smoke';
export const SQS_QUEUE_NAME_MAX_LENGTH =
  SQS_NAME_MAX_LENGTH - Math.max(SQS_DLQ_SUFFIX.length, SQS_SMOKE_SUFFIX.length);

export function isValidQueueName(name: string): boolean {
  return SQS_NAME_PATTERN.test(name) && name.length <= SQS_QUEUE_NAME_MAX_LENGTH;
}

export function isValidDlqName(name: string): boolean {
  return SQS_NAME_PATTERN.test(name) && name.length <= SQS_NAME_MAX_LENGTH;
}

// The smoke check must not compete with the worker for the main queue: processMessage deletes a
// probe whose ticket id is not a UUID, so a worker could swallow it first. Setup creates this
// dedicated queue and the runtime policy grants the same four SQS actions on it.
export function smokeQueueName(queueName: string): string {
  return `${queueName}${SQS_SMOKE_SUFFIX}`;
}
