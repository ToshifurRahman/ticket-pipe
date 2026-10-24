import type { ProcessingResult } from '../repositories/processing.js';
import type { TriageOutput } from './ticket-phases.js';

export interface ValidationResult {
  valid: boolean;
  missingFields: string[];
}

export interface DraftFields {
  customerReply: string | null;
  internalNote: string | null;
  nextSteps: string[] | null;
}

const TRIAGE_FIELDS = [
  'category',
  'priority',
  'sentiment',
  'recommendedTeam',
  'issueSummary',
] as const;

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

function result(missingFields: string[]): ValidationResult {
  return { valid: missingFields.length === 0, missingFields };
}

export function validateTriageOutput(triage: TriageOutput): ValidationResult {
  const missingFields: string[] = TRIAGE_FIELDS.filter(field => isBlank(triage[field]));
  if (typeof triage.escalate !== 'boolean') {
    missingFields.push('escalate');
  }
  return result(missingFields);
}

export function validateDraftOutput(draft: DraftFields): ValidationResult {
  const missingFields: string[] = [];

  if (isBlank(draft.customerReply)) {
    missingFields.push('customerReply');
  }

  if (isBlank(draft.internalNote)) {
    missingFields.push('internalNote');
  }

  if (
    !Array.isArray(draft.nextSteps) ||
    draft.nextSteps.length === 0 ||
    draft.nextSteps.every(isBlank)
  ) {
    missingFields.push('nextSteps');
  }

  return result(missingFields);
}

export function validateProcessingOutput(processing: ProcessingResult): ValidationResult {
  return result([
    ...validateTriageOutput(processing).missingFields,
    ...validateDraftOutput(processing).missingFields,
  ]);
}
