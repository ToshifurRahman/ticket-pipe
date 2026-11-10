// The smoke check must not compete with the worker for the main queue: processMessage deletes a
// probe whose ticket id is not a UUID, so a worker could swallow it first. Setup creates this
// dedicated queue and the runtime policy grants the same four SQS actions on it.
export function smokeQueueName(queueName: string): string {
  return `${queueName}-smoke`;
}
