import { fileURLToPath } from 'url';
import { Portkey } from 'portkey-ai';
import { logger } from './lib/logger.js';
import { receiveMessages, deleteMessage } from './lib/queue.js';
import { getTicketById, updateTicketStatus } from './repositories/tickets.js';
import { insertProcessingResult, type ProcessingResult } from './repositories/processing.js';
import { insertEvent } from './repositories/events.js';

if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY environment variable is required');
if (!process.env.PORTKEY_API_KEY) throw new Error('PORTKEY_API_KEY environment variable is required');

const portkey = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY,
  provider: 'groq',
  Authorization: process.env.GROQ_API_KEY,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function triageTicket(
  ticketId: string,
  subject: string,
  description: string
): Promise<Omit<ProcessingResult, 'customerReply' | 'internalNote' | 'nextSteps'>> {
  const completion = await portkey.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    tools: [
      {
        type: 'function',
        function: {
          name: 'save_triage',
          description: 'Save the triage result for a support ticket',
          parameters: {
            type: 'object',
            properties: {
              category: { type: 'string', description: 'Type of issue (e.g. billing, technical, account access)' },
              priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
              sentiment: { type: 'string', enum: ['neutral', 'frustrated', 'angry'] },
              escalate: { type: 'boolean', description: 'Whether this ticket should go to a senior agent' },
              recommended_team: { type: 'string', description: 'Team best placed to handle this ticket' },
              issue_summary: { type: 'string', description: 'Short plain-English description of what the customer needs' },
            },
            required: ['category', 'priority', 'sentiment', 'escalate', 'recommended_team', 'issue_summary'],
          },
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: 'save_triage' } },
    messages: [
      {
        role: 'user',
        content: `Triage this support ticket:\n\nSubject: ${subject}\nDescription: ${description}`,
      },
    ],
  }, { headers: { 'x-portkey-metadata': JSON.stringify({ ticketId }) } });

  const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error('Triage: no tool call in response');

  const input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
  return {
    category: input.category as string,
    priority: input.priority as string,
    sentiment: input.sentiment as string,
    escalate: input.escalate as boolean,
    recommendedTeam: input.recommended_team as string,
    issueSummary: input.issue_summary as string,
  };
}

export async function draftResponse(
  ticketId: string,
  subject: string,
  description: string,
  triage: Omit<ProcessingResult, 'customerReply' | 'internalNote' | 'nextSteps'>
): Promise<Pick<ProcessingResult, 'customerReply' | 'internalNote' | 'nextSteps'>> {
  const completion = await portkey.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    tools: [
      {
        type: 'function',
        function: {
          name: 'save_draft',
          description: 'Save the response draft for a support ticket',
          parameters: {
            type: 'object',
            properties: {
              customer_reply: { type: 'string', description: 'Complete ready-to-send reply to the customer' },
              internal_note: { type: 'string', description: 'Context and recommendations for the agent' },
              next_steps: {
                type: 'array',
                items: { type: 'string' },
                description: 'Short list of actions the agent should consider',
              },
            },
            required: ['customer_reply', 'internal_note', 'next_steps'],
          },
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: 'save_draft' } },
    messages: [
      {
        role: 'user',
        content: [
          `Write a response draft for this support ticket.`,
          ``,
          `Ticket:`,
          `Subject: ${subject}`,
          `Description: ${description}`,
          ``,
          `Triage findings:`,
          `- Category: ${triage.category}`,
          `- Priority: ${triage.priority}`,
          `- Customer sentiment: ${triage.sentiment}`,
          `- Escalate: ${triage.escalate}`,
          `- Recommended team: ${triage.recommendedTeam}`,
          `- Issue summary: ${triage.issueSummary}`,
        ].join('\n'),
      },
    ],
  }, { headers: { 'x-portkey-metadata': JSON.stringify({ ticketId }) } });

  const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error('Draft: no tool call in response');

  const input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
  return {
    customerReply: input.customer_reply as string,
    internalNote: input.internal_note as string,
    nextSteps: input.next_steps as string[],
  };
}

export async function processMessage(ticketId: string, receiptHandle: string): Promise<void> {
  if (!UUID_RE.test(ticketId)) {
    logger.warn({ ticketId }, 'Skipping message with invalid ticketId');
    await deleteMessage(receiptHandle);
    return;
  }

  logger.info({ ticketId }, 'Processing ticket');

  await updateTicketStatus(ticketId, 'processing');
  const ticket = await getTicketById(ticketId);

  let triage: Omit<ProcessingResult, 'customerReply' | 'internalNote' | 'nextSteps'>;
  try {
    triage = await triageTicket(ticketId, ticket.subject, ticket.description);
    await insertEvent(ticketId, 'triage.completed');
    logger.info({ ticketId }, 'Triage complete');
  } catch (err) {
    await insertEvent(ticketId, 'triage.failed', (err as Error).message);
    await updateTicketStatus(ticketId, 'failed');
    throw err;
  }

  let draft: Pick<ProcessingResult, 'customerReply' | 'internalNote' | 'nextSteps'>;
  try {
    draft = await draftResponse(ticketId, ticket.subject, ticket.description, triage);
    await insertEvent(ticketId, 'draft.completed');
    logger.info({ ticketId }, 'Draft complete');
  } catch (err) {
    await insertEvent(ticketId, 'draft.failed', (err as Error).message);
    await updateTicketStatus(ticketId, 'failed');
    throw err;
  }

  try {
    await insertProcessingResult(ticketId, { ...triage, ...draft });
    await updateTicketStatus(ticketId, 'completed');
    await insertEvent(ticketId, 'ticket.completed');
  } catch (err) {
    await insertEvent(ticketId, 'ticket.failed', (err as Error).message);
    await updateTicketStatus(ticketId, 'failed');
    throw err;
  }

  await deleteMessage(receiptHandle);
  logger.info({ ticketId }, 'Ticket completed');
}

async function run(): Promise<void> {
  logger.info('Worker started, polling...');

  while (true) {
    const messages = await receiveMessages();
    await Promise.all(
      messages.map(({ ticketId, receiptHandle }) =>
        processMessage(ticketId, receiptHandle).catch(err => {
          logger.error({ err, ticketId }, 'Failed to process ticket');
        })
      )
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
