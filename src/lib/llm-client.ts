import { createHeaders, PORTKEY_GATEWAY_URL } from 'portkey-ai';
import { z } from 'zod';

export const TriageOutputSchema = z.object({
  category: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  sentiment: z.enum(['neutral', 'frustrated', 'angry']),
  escalate: z.boolean(),
  recommended_team: z.string(),
  issue_summary: z.string(),
});

export const DraftOutputSchema = z.object({
  customer_reply: z.string(),
  internal_note: z.string(),
  next_steps: z.array(z.string()),
});

export type TriageOutput = z.infer<typeof TriageOutputSchema>;
export type DraftOutput = z.infer<typeof DraftOutputSchema>;

export type LlmOutcome = 'success' | 'http_error' | 'network_error' | 'timeout' | 'invalid_response';

export class LlmCallError extends Error {
  readonly outcome: LlmOutcome;
  readonly httpStatus?: number;

  constructor(outcome: LlmOutcome, message: string, httpStatus?: number) {
    super(message);
    this.name = 'LlmCallError';
    this.outcome = outcome;
    this.httpStatus = httpStatus;
  }
}

export interface LlmProvider {
  name: 'primary' | 'backup';
  apiKey: string;
  model: string;
}

export interface LlmUsage {
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface LlmCallResult<T> {
  output: T;
  usage: LlmUsage;
  httpStatus: number;
}

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

export function getPrimaryProvider(): LlmProvider {
  return {
    name: 'primary',
    apiKey: process.env.GROQ_API_KEY!,
    model: process.env.PRIMARY_MODEL || DEFAULT_MODEL,
  };
}

export function isBackupConfigured(): boolean {
  return !!process.env.BACKUP_API_KEY;
}

export function getBackupProvider(): LlmProvider {
  return {
    name: 'backup',
    apiKey: process.env.BACKUP_API_KEY!,
    model: process.env.BACKUP_MODEL || DEFAULT_MODEL,
  };
}

function resolveTimeoutMs(): number {
  const parsed = Number(process.env.AI_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

async function callLlmWithFunction<T>(
  provider: LlmProvider,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  schema: z.ZodSchema<T>,
  schemaName: string,
  properties: Record<string, { type: string; description: string }>,
  required: string[]
): Promise<LlmCallResult<T>> {
  const headers = createHeaders({
    provider: 'groq',
    apiKey: process.env.PORTKEY_API_KEY!,
    Authorization: provider.apiKey,
  });

  let response: Response;
  try {
    response = await fetch(`${PORTKEY_GATEWAY_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        functions: [
          {
            name: schemaName,
            description: `Return the ${schemaName} as a JSON object`,
            parameters: {
              type: 'object',
              properties,
              required,
            },
          },
        ],
        function_call: { name: schemaName },
      }),
      signal: AbortSignal.timeout(resolveTimeoutMs()),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new LlmCallError('timeout', `LLM call timed out: ${err.message}`);
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new LlmCallError('network_error', `LLM call failed: ${message}`);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new LlmCallError('http_error', `LLM call failed: ${response.status} ${error}`, response.status);
  }

  let data: {
    choices: Array<{
      message: {
        function_call?: {
          arguments: string;
        };
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
    };
  };
  try {
    data = (await response.json()) as typeof data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LlmCallError('invalid_response', `Failed to parse LLM response as JSON: ${message}`, response.status);
  }

  const functionCall = data.choices[0]?.message.function_call;
  if (!functionCall) {
    throw new LlmCallError('invalid_response', 'No function call in LLM response', response.status);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(functionCall.arguments);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LlmCallError('invalid_response', `Failed to parse function call arguments: ${message}`, response.status);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new LlmCallError('invalid_response', `LLM output failed schema validation: ${result.error.message}`, response.status);
  }

  return {
    output: result.data,
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? null,
      completionTokens: data.usage?.completion_tokens ?? null,
    },
    httpStatus: response.status,
  };
}

export async function triage(
  provider: LlmProvider,
  subject: string,
  description: string
): Promise<LlmCallResult<TriageOutput>> {
  const systemPrompt =
    'You are a support ticket triage agent. Analyze the ticket and classify it accurately.';
  const userPrompt = `Triage this support ticket:\n\nSubject: ${subject}\nDescription: ${description}`;

  return callLlmWithFunction(
    provider,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    TriageOutputSchema,
    'triage_output',
    {
      category: { type: 'string', description: 'Ticket category' },
      priority: { type: 'string', description: 'Priority level (low, medium, high, critical)' },
      sentiment: { type: 'string', description: 'Customer sentiment (neutral, frustrated, angry)' },
      escalate: { type: 'boolean', description: 'Whether to escalate' },
      recommended_team: { type: 'string', description: 'Recommended team' },
      issue_summary: { type: 'string', description: 'Summary of the issue' },
    },
    ['category', 'priority', 'sentiment', 'escalate', 'recommended_team', 'issue_summary']
  );
}

export async function draft(
  provider: LlmProvider,
  subject: string,
  description: string,
  triageOutput: TriageOutput
): Promise<LlmCallResult<DraftOutput>> {
  const systemPrompt =
    'You are a support agent. Write a helpful, empathetic response draft based on the ticket and triage findings.';
  const userPrompt = `Write a response draft for this support ticket.

Subject: ${subject}
Description: ${description}

Triage findings:
- Category: ${triageOutput.category}
- Priority: ${triageOutput.priority}
- Customer sentiment: ${triageOutput.sentiment}
- Escalate: ${triageOutput.escalate}
- Recommended team: ${triageOutput.recommended_team}
- Issue summary: ${triageOutput.issue_summary}`;

  return callLlmWithFunction(
    provider,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    DraftOutputSchema,
    'draft_output',
    {
      customer_reply: { type: 'string', description: 'Response to customer' },
      internal_note: { type: 'string', description: 'Internal note' },
      next_steps: { type: 'array', description: 'Next steps' },
    },
    ['customer_reply', 'internal_note', 'next_steps']
  );
}
