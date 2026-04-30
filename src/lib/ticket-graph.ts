import { z } from 'zod';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
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

export function buildLlm(): ChatOpenAI {
  return new ChatOpenAI({
    apiKey: 'X',
    model: 'llama-3.3-70b-versatile',
    configuration: {
      baseURL: PORTKEY_GATEWAY_URL,
      defaultHeaders: createHeaders({
        provider: 'groq',
        apiKey: process.env.PORTKEY_API_KEY!,
        Authorization: process.env.GROQ_API_KEY!,
      }),
    },
  });
}

export const llm = buildLlm();

export const triagePrompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a support ticket triage agent. Analyze the ticket and classify it accurately.'],
  [
    'human',
    'Triage this support ticket:\n\nSubject: {subject}\nDescription: {description}',
  ],
]);

export const draftPrompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a support agent. Write a helpful, empathetic response draft based on the ticket and triage findings.'],
  [
    'human',
    `Write a response draft for this support ticket.

Subject: {subject}
Description: {description}

Triage findings:
- Category: {category}
- Priority: {priority}
- Customer sentiment: {sentiment}
- Escalate: {escalate}
- Recommended team: {recommended_team}
- Issue summary: {issue_summary}`,
  ],
]);

const TicketStateAnnotation = Annotation.Root({
  ticketId: Annotation<string>(),
  subject: Annotation<string>(),
  description: Annotation<string>(),
  triageOutput: Annotation<TriageOutput | undefined>(),
  draftOutput: Annotation<DraftOutput | undefined>(),
});

type TicketState = typeof TicketStateAnnotation.State;

async function triageNode(state: TicketState): Promise<Partial<TicketState>> {
  const chain = triagePrompt.pipe(llm.withStructuredOutput(TriageOutputSchema, { method: 'functionCalling' }));
  const triageOutput = await chain.invoke(
    { subject: state.subject, description: state.description },
    { metadata: { ticketId: state.ticketId } }
  );
  return { triageOutput };
}

async function draftNode(state: TicketState): Promise<Partial<TicketState>> {
  const chain = draftPrompt.pipe(llm.withStructuredOutput(DraftOutputSchema, { method: 'functionCalling' }));
  const draftOutput = await chain.invoke(
    {
      subject: state.subject,
      description: state.description,
      ...state.triageOutput,
    },
    { metadata: { ticketId: state.ticketId } }
  );
  return { draftOutput };
}

export const ticketGraph = new StateGraph(TicketStateAnnotation)
  .addNode('triage', triageNode)
  .addNode('draft', draftNode)
  .addEdge(START, 'triage')
  .addEdge('triage', 'draft')
  .addEdge('draft', END)
  .compile();

export const triageGraph = new StateGraph(TicketStateAnnotation)
  .addNode('triage', triageNode)
  .addEdge(START, 'triage')
  .addEdge('triage', END)
  .compile();

export const draftGraph = new StateGraph(TicketStateAnnotation)
  .addNode('draft', draftNode)
  .addEdge(START, 'draft')
  .addEdge('draft', END)
  .compile();
