import { z } from 'zod';
import { createHeaders, PORTKEY_GATEWAY_URL } from 'portkey-ai';

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

const headers = createHeaders({
  provider: 'groq',
  apiKey: process.env.PORTKEY_API_KEY!,
  Authorization: process.env.BACKUP_API_KEY!,
});

async function callLlmWithFunction<T>(
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  schema: z.ZodSchema<T>,
  schemaName: string,
  properties: Record<string, { type: string; description: string }>,
  required: string[]
): Promise<T> {
  const response = await fetch(`${PORTKEY_GATEWAY_URL}/openai/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      model: process.env.BACKUP_MODEL || 'llama-3.3-70b-versatile',
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
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM call failed: ${response.status} ${error}`);
  }

  const data = (await response.json()) as {
    choices: Array<{
      message: {
        function_call?: {
          arguments: string;
        };
      };
    }>;
  };

  const functionCall = data.choices[0]?.message.function_call;
  if (!functionCall) {
    throw new Error('No function call in LLM response');
  }

  const parsed = JSON.parse(functionCall.arguments);
  return schema.parse(parsed);
}

export async function triage(
  subject: string,
  description: string
): Promise<TriageOutput> {
  const systemPrompt = 'You are a support ticket triage agent. Analyze the ticket and classify it accurately.';
  const userPrompt = `Triage this support ticket:\n\nSubject: ${subject}\nDescription: ${description}`;

  return callLlmWithFunction(
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
  subject: string,
  description: string,
  triageOutput: TriageOutput
): Promise<DraftOutput> {
  const systemPrompt = 'You are a support agent. Write a helpful, empathetic response draft based on the ticket and triage findings.';
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