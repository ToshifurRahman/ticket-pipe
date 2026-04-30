import { AIService } from '../src/lib/ai-service.js';

const ai = new AIService();

async function run() {
  console.log('--- Step 1: Triage graph ---');
  const triageResult = await ai.triage(
    'test-ticket-id',
    'Cannot log in to my account',
    'I have been trying to log in for the past 2 hours and keep getting an "invalid credentials" error even though I just reset my password.'
  );
  console.log('Triage result:', JSON.stringify(triageResult, null, 2));

  console.log('\n--- Step 2: Draft graph ---');
  const draftResult = await ai.draft(
    'test-ticket-id',
    'Cannot log in to my account',
    'I have been trying to log in for the past 2 hours and keep getting an "invalid credentials" error even though I just reset my password.',
    triageResult
  );
  console.log('Draft result:', JSON.stringify(draftResult, null, 2));

  console.log('\n✓ LangChain integration working. Check smith.langchain.com → ticket-pipe project for traces.');
}

run().catch(err => {
  console.error('✗ Integration test failed:', err.message);
  process.exit(1);
});
