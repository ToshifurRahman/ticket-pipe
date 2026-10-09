import { describe, it, expect, vi, afterEach } from 'vitest';
import { triage, LlmCallError, getLlmMode, assertLlmModeAllowed, type LlmProvider } from '../../src/lib/llm-client.js';

const PROVIDER: LlmProvider = { name: 'primary', gateway: 'groq', apiKey: 'test-key', model: 'test-model' };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const VALID_TRIAGE_ARGS = {
  category: 'technical',
  priority: 'high',
  sentiment: 'frustrated',
  escalate: false,
  recommended_team: 'tech-support',
  issue_summary: 'Customer cannot log in',
};

function validTriageResponse(usage?: { prompt_tokens: number; completion_tokens: number }) {
  return jsonResponse(200, {
    choices: [{ message: { function_call: { arguments: JSON.stringify(VALID_TRIAGE_ARGS) } } }],
    ...(usage ? { usage } : {}),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('triage (llm-client)', () => {
  it('returns parsed output and usage on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(validTriageResponse({ prompt_tokens: 12, completion_tokens: 34 })));

    const result = await triage(PROVIDER, 'Subject', 'Description');

    expect(result.output).toEqual(VALID_TRIAGE_ARGS);
    expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 34 });
    expect(result.httpStatus).toBe(200);
  });

  it('reports null usage when the response has no usage field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(validTriageResponse()));

    const result = await triage(PROVIDER, 'Subject', 'Description');

    expect(result.usage).toEqual({ promptTokens: null, completionTokens: null });
  });

  it('throws http_error with status on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })));

    const err = await triage(PROVIDER, 'Subject', 'Description').catch(e => e);

    expect(err).toBeInstanceOf(LlmCallError);
    expect((err as LlmCallError).outcome).toBe('http_error');
    expect((err as LlmCallError).httpStatus).toBe(429);
  });

  it('throws network_error when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    const err = await triage(PROVIDER, 'Subject', 'Description').catch(e => e);

    expect(err).toBeInstanceOf(LlmCallError);
    expect((err as LlmCallError).outcome).toBe('network_error');
  });

  it('throws timeout when fetch aborts with a TimeoutError', async () => {
    const timeoutError = new Error('The operation timed out');
    timeoutError.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError));

    const err = await triage(PROVIDER, 'Subject', 'Description').catch(e => e);

    expect(err).toBeInstanceOf(LlmCallError);
    expect((err as LlmCallError).outcome).toBe('timeout');
  });

  it('throws invalid_response when there is no function call', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { choices: [{ message: {} }] })));

    const err = await triage(PROVIDER, 'Subject', 'Description').catch(e => e);

    expect(err).toBeInstanceOf(LlmCallError);
    expect((err as LlmCallError).outcome).toBe('invalid_response');
  });

  it('throws invalid_response when function call arguments are not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, { choices: [{ message: { function_call: { arguments: '{not json' } } }] })
      )
    );

    const err = await triage(PROVIDER, 'Subject', 'Description').catch(e => e);

    expect(err).toBeInstanceOf(LlmCallError);
    expect((err as LlmCallError).outcome).toBe('invalid_response');
  });

  it('throws invalid_response when the output fails schema validation', async () => {
    const badArgs = { ...VALID_TRIAGE_ARGS, priority: 'not-a-real-priority' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, { choices: [{ message: { function_call: { arguments: JSON.stringify(badArgs) } } }] })
      )
    );

    const err = await triage(PROVIDER, 'Subject', 'Description').catch(e => e);

    expect(err).toBeInstanceOf(LlmCallError);
    expect((err as LlmCallError).outcome).toBe('invalid_response');
  });
});

describe('LLM_MODE guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to real and accepts "real" and "fake"', () => {
    vi.stubEnv('LLM_MODE', '');
    expect(getLlmMode()).toBe('real');
    vi.stubEnv('LLM_MODE', 'real');
    expect(getLlmMode()).toBe('real');
    vi.stubEnv('LLM_MODE', 'fake');
    expect(getLlmMode()).toBe('fake');
  });

  it('throws on an unknown mode so a typo never sends real traffic', () => {
    vi.stubEnv('LLM_MODE', 'fkae');
    expect(() => assertLlmModeAllowed()).toThrow(/LLM_MODE/);
  });

  it('refuses fake mode in production', () => {
    vi.stubEnv('LLM_MODE', 'fake');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => assertLlmModeAllowed()).toThrow(/production/);
  });

  it('allows fake mode outside production', () => {
    vi.stubEnv('LLM_MODE', 'fake');
    vi.stubEnv('NODE_ENV', 'test');
    expect(() => assertLlmModeAllowed()).not.toThrow();
  });
});
