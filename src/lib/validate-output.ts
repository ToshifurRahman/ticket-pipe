import type { ProcessingResult } from '../repositories/processing.js';

export interface ValidationResult {
  valid: boolean;
  missingFields: string[];
}

const TRIAGE_FIELDS = [
  'category',
  'priority',
  'sentiment',
  'recommendedTeam',
  'issueSummary',
] as const;

export function validateProcessingOutput(result: ProcessingResult): ValidationResult {
  const missingFields: string[] = [];

  for (const field of TRIAGE_FIELDS) {
    const value = result[field];
    if (typeof value !== 'string' || value.trim() === '') {
      missingFields.push(field);
    }
  }

  if (typeof result.escalate !== 'boolean') {
    missingFields.push('escalate');
  }

  if (typeof result.customerReply !== 'string' || result.customerReply.trim() === '') {
    missingFields.push('customerReply');
  }

  if (typeof result.internalNote !== 'string' || result.internalNote.trim() === '') {
    missingFields.push('internalNote');
  }

  if (
    !Array.isArray(result.nextSteps) ||
    result.nextSteps.length === 0 ||
    result.nextSteps.every(step => typeof step !== 'string' || step.trim() === '')
  ) {
    missingFields.push('nextSteps');
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}
