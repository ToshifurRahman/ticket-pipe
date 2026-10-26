/** What the AI pipeline hands the worker for a technical ticket: triage, then the draft. */
export function triageResult() {
  return {
    category: 'technical',
    priority: 'high',
    sentiment: 'frustrated',
    escalate: false,
    recommendedTeam: 'tech-support',
    issueSummary: 'Customer cannot log in',
  };
}

export function draftResult() {
  return {
    customerReply: 'We are looking into your login issue.',
    internalNote: 'Check auth service logs.',
    nextSteps: ['Check auth logs', 'Reset session'],
  };
}
