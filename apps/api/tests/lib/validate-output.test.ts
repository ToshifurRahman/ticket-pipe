import { describe, it, expect } from 'vitest';
import { validateProcessingOutput, validateTriageOutput, validateDraftOutput } from '../../src/lib/validate-output.js';
import type { ProcessingResult } from '../../src/repositories/processing.js';

function validResult(): ProcessingResult {
  return {
    category: 'technical',
    priority: 'high',
    sentiment: 'frustrated',
    escalate: false,
    recommendedTeam: 'tech-support',
    issueSummary: 'Customer cannot log in',
    customerReply: 'We are looking into your login issue.',
    internalNote: 'Check auth service logs.',
    nextSteps: ['Check auth logs', 'Reset session'],
  };
}

describe('validateProcessingOutput', () => {
  it('returns valid for a complete result', () => {
    const result = validateProcessingOutput(validResult());
    expect(result.valid).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it('flags empty string fields', () => {
    const result = validResult();
    result.category = '';
    result.priority = '';
    const output = validateProcessingOutput(result);
    expect(output.valid).toBe(false);
    expect(output.missingFields).toContain('category');
    expect(output.missingFields).toContain('priority');
  });

  it('flags whitespace-only string fields', () => {
    const result = validResult();
    result.issueSummary = '   ';
    result.recommendedTeam = '\t';
    const output = validateProcessingOutput(result);
    expect(output.valid).toBe(false);
    expect(output.missingFields).toContain('issueSummary');
    expect(output.missingFields).toContain('recommendedTeam');
  });

  it('flags null customerReply', () => {
    const result = validResult();
    result.customerReply = null;
    const output = validateProcessingOutput(result);
    expect(output.valid).toBe(false);
    expect(output.missingFields).toContain('customerReply');
  });

  it('flags null internalNote', () => {
    const result = validResult();
    result.internalNote = null;
    const output = validateProcessingOutput(result);
    expect(output.valid).toBe(false);
    expect(output.missingFields).toContain('internalNote');
  });

  it('flags null nextSteps', () => {
    const result = validResult();
    result.nextSteps = null;
    const output = validateProcessingOutput(result);
    expect(output.valid).toBe(false);
    expect(output.missingFields).toContain('nextSteps');
  });

  it('flags empty nextSteps array', () => {
    const result = validResult();
    result.nextSteps = [];
    const output = validateProcessingOutput(result);
    expect(output.valid).toBe(false);
    expect(output.missingFields).toContain('nextSteps');
  });

  it('flags nextSteps with only empty strings', () => {
    const result = validResult();
    result.nextSteps = ['  ', ''];
    const output = validateProcessingOutput(result);
    expect(output.valid).toBe(false);
    expect(output.missingFields).toContain('nextSteps');
  });

  it('accepts nextSteps with one valid step among empty ones', () => {
    const result = validResult();
    result.nextSteps = ['  ', 'Reset session'];
    const output = validateProcessingOutput(result);
    expect(output.valid).toBe(true);
    expect(output.missingFields).toEqual([]);
  });

  it('flags all missing fields at once', () => {
    const result: ProcessingResult = {
      category: '',
      priority: '',
      sentiment: '',
      escalate: true,
      recommendedTeam: '',
      issueSummary: '',
      customerReply: null,
      internalNote: null,
      nextSteps: null,
    };
    const output = validateProcessingOutput(result);
    expect(output.valid).toBe(false);
    expect(output.missingFields).toEqual([
      'category',
      'priority',
      'sentiment',
      'recommendedTeam',
      'issueSummary',
      'customerReply',
      'internalNote',
      'nextSteps',
    ]);
  });

  it('does not flag escalate when false', () => {
    const result = validResult();
    result.escalate = false;
    const output = validateProcessingOutput(result);
    expect(output.valid).toBe(true);
    expect(output.missingFields).toEqual([]);
  });
});

describe('validateTriageOutput', () => {
  it('accepts complete triage output', () => {
    expect(validateTriageOutput(validResult())).toEqual({ valid: true, missingFields: [] });
  });

  it('flags blank triage fields and a non-boolean escalate', () => {
    const triage = { ...validResult(), category: ' ', escalate: undefined as unknown as boolean };
    expect(validateTriageOutput(triage)).toEqual({ valid: false, missingFields: ['category', 'escalate'] });
  });

  it('does not look at draft fields', () => {
    const result: ProcessingResult = { ...validResult(), customerReply: null };
    expect(validateTriageOutput(result).valid).toBe(true);
  });
});

describe('validateDraftOutput', () => {
  it('accepts a complete draft', () => {
    expect(validateDraftOutput(validResult())).toEqual({ valid: true, missingFields: [] });
  });

  it('flags missing draft fields only', () => {
    expect(
      validateDraftOutput({ customerReply: '', internalNote: null, nextSteps: ['  '] })
    ).toEqual({ valid: false, missingFields: ['customerReply', 'internalNote', 'nextSteps'] });
  });
});
