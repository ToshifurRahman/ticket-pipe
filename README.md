# Ticket-Pipeline

An AI-powered ticket processing system that automatically analyzes support tickets, performs intelligent triage, and generates response drafts using LLMs. Built with Express.js, PostgreSQL, AWS SQS, and LangChain.

![Node.js](https://img.shields.io/badge/node.js-v20+-green) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13+-blue)

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Features](#features)
- [AI Observability](#ai-observability)
- [Project Structure](#project-structure)
- [Development Guide](#development-guide)

## Quick Start

### Prerequisites

- **Node.js** v20 or higher
- **PostgreSQL** 13 or higher
- **AWS Account** (for SQS)
- **API Keys**:
  - Google AI Studio API Key (Gemini, free tier — primary LLM provider)
  - Portkey API Key (for AI gateway & fallback routing)
  - GROQ API Key (optional, used as the backup LLM provider)
  - LangSmith API Key (for LangChain tracing)

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd ticket-pipe
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your actual credentials
   ```

4. **Set up the database**:
   ```bash
   npm run migrate
   ```

5. **Set up AWS infrastructure** (SQS queue, etc.):
   ```bash
   npm run setup
   ```

### Running Locally

**Terminal 1 - Start the API server**:
```bash
npm run dev
```
The server will start on `http://localhost:3000`

**Terminal 2 - Start the background worker**:
```bash
npm run worker
```

### Verify It's Working

```bash
# Submit a ticket
curl -X POST http://localhost:3000/api/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Login not working",
    "description": "I cannot log in with my password"
  }'

# Response example:
# {
#   "ticketId": "550e8400-e29b-41d4-a716-446655440000",
#   "referenceNumber": "TKT-001",
#   "status": "queued",
#   "createdAt": "2026-04-30T11:05:37.964Z"
# }

# Check ticket status
curl http://localhost:3000/api/tickets/550e8400-e29b-41d4-a716-446655440000
```

## Architecture Overview

```
User/Portal
    ↓
[Express API Server] → [PostgreSQL Database]
    ↓                      ↑
[AWS SQS Queue] ← → [Background Worker]
                         ↓
                  [LLM Service (LangChain/LangGraph)]
                         ↓
                  [Portkey Gateway + GROQ]
                         ↓
                  [LangSmith Tracing]
```

### Key Components

#### 1. **API Server** (`src/index.ts`)
- Express.js REST API for ticket submission and status tracking
- WebSocket support via Socket.io for real-time updates
- Request validation using Zod schemas
- Error handling and logging with Pino

#### 2. **Background Worker** (`src/worker.ts`)
- Long-running process that polls AWS SQS for messages
- Processes tickets through the triage → draft pipeline
- Implements retry logic with per-stage failure counting
- Escalates tickets to ops dashboard when max retries exceeded
- Manages phase transitions and event recording

#### 3. **Database Layer** (`src/repositories/*`)
- PostgreSQL for persistent storage
- Three main tables: `tickets`, `ticket_processing`, `ticket_events`
- Optimized indexes for fast lookups by ticket ID

#### 4. **AI Service** (`src/lib/ai-service.ts` & `src/lib/llm-client.ts`)
- **Triage Phase**: Analyzes ticket to determine category, priority, sentiment, escalation needs, and recommended team
- **Draft Phase**: Generates customer-facing reply, internal notes, and next action steps
- Falls back from the primary LLM provider to a backup provider on failure
- Integrates with Portkey for request routing
- Records every provider call (outcome, duration, tokens) to `ai_interactions` for ops review — see [AI Observability](#ai-observability)

#### 5. **Queue System** (`src/lib/queue.ts`)
- AWS SQS integration for reliable message passing
- Handles message batching and deletion
- Supports LocalStack for local development

### Data Flow

1. **Ticket Submission**: User submits ticket via `POST /api/tickets` → Stored in DB with status `queued` → Message sent to SQS
2. **Queue Processing**: Worker polls SQS → Retrieves ticket details
3. **Triage Phase**: LLM analyzes content → Produces category, priority, sentiment, team assignment → Stored in `ticket_processing`
4. **Draft Phase**: LLM generates response using triage output → Produces customer reply, internal notes, next steps
5. **Completion**: Results saved → Ticket status updated to `completed` → Real-time events broadcast to clients via Socket.io
6. **Error Handling**: On failure at any stage → Event recorded → Retried up to MAX_ATTEMPTS (3) → Escalated to ops if max retries exceeded

## Features

### Core Capabilities
- **Automated Ticket Submission**: RESTful API for creating support tickets with automatic validation
- **Real-time Status Tracking**: WebSocket-based live updates as tickets progress through processing
- **Reference Numbers**: Every ticket gets a unique reference number (TKT-XXX) for easy tracking
- **Pagination & Filtering**: List tickets with filtering by status and sorting options

### AI-Powered Processing
- **Intelligent Triage**: Automatic categorization, priority assignment, sentiment analysis
- **Smart Escalation**: AI-determined escalation flags to route complex issues to the right team
- **Draft Response Generation**: LLM-powered customer-facing responses with internal notes
- **Next Steps Planning**: Automated suggestion of follow-up actions for the support team

### Reliability & Retry Logic
- **Per-Stage Retry**: Each processing phase (triage, draft) retries independently with configurable retry counts
- **Escalation on Max Failures**: Tickets that exceed retry thresholds are escalated to ops team
- **Event Audit Trail**: Complete history of all state transitions and failures recorded as events
- **Resume Capability**: Failed tickets can be manually reprocessed via `POST /api/tickets/:id/replay`

### Developer Features
- **Local Development Support**: Works with LocalStack for SQS, Portkey for routing, and local PostgreSQL
- **Comprehensive Logging**: Structured logging with Pino for debugging and monitoring
- **Socket.io Integration**: Real-time bi-directional communication for ops alerts

## Ops Live Feed

Ops staff can watch every ticket event across the organization over Socket.io. The feed carries
status information only. It never includes the subject, description, AI output or an event's error text.

```js
const socket = io('http://localhost:3000');
socket.on('ops:ticket_event', (e) => console.log(e));
await socket.emitWithAck('ops:subscribe'); // resolves to { ok: true } once subscribed
```

Each `ops:ticket_event` payload is `{ ticketId, referenceNumber, event, occurredAt }`, where `event`
is one of `ticket.submitted`, `triage.started`, `triage.completed`, `triage.failed`, `draft.started`,
`draft.completed`, `draft.failed`, `ticket.completed`, `ticket.failed` or `ticket.needs_attention`.

When a ticket runs out of retries, ops also receives `ticket:needs_attention` with
`{ ticketId, referenceNumber, reason, occurredAt }`. `reason` is one of `triage_retries_exhausted`,
`draft_retries_exhausted`, `incomplete_output` or `processing_result_missing`. It is a fixed code, never the
error message, because error messages can quote AI output or customer content. The full text stays in the
ticket's event history (`GET /api/tickets/:id`).

**Privacy boundary.** The ops room is visible to every ops subscriber, so only
`src/services/ops-feed.ts` may publish to it, and only identifiers, codes and timestamps. AI output (triage
findings and the draft reply) is delivered only to the ticket's own room, which only that customer joins.
`tests/ops-feed.guard.test.ts` fails if any other file publishes to the ops room.

Every event goes through `recordTicketEvent()` (`src/services/ticket-events.ts`), which writes the
`ticket_events` row and publishes to the feed, so the two cannot drift apart. Publishing is best-effort
and never affects ticket processing. Customers join only their own ticket room (`join` accepts a
ticket UUID and nothing else), so they cannot subscribe to the feed.

## AI Observability

Every call to an LLM provider (primary or backup, per triage/draft attempt) is recorded in the
`ai_interactions` table with its outcome, duration, and token usage. The AI call itself is never
blocked or failed by a recording error — a failed write is logged and the ticket keeps processing.

**Outcome values**: `success`, `http_error` (non-2xx response, with `http_status`), `network_error`
(the request itself failed), `timeout` (exceeded `AI_TIMEOUT_MS`, default 30s), `invalid_response`
(malformed or schema-invalid model output).

**Ops endpoints**:
- `GET /api/ops/ai-interactions` — paginated list, filterable by `provider`, `operation`, `outcome`,
  `ticketId`, `since`/`until`
- `GET /api/ops/ai-interactions/summary` — per `operation`+`provider` counts, success rate, average/p50/p95
  duration, and total token usage, over a `since`/`until` window (defaults to the last 24h)

**Example queries** (via `psql`):
```sql
-- Recent failures, most recent first
SELECT ticket_id, operation, provider, outcome, http_status, error_message, created_at
FROM ai_interactions
WHERE outcome != 'success'
ORDER BY created_at DESC
LIMIT 20;

-- Primary provider health over the last hour
SELECT outcome, COUNT(*), AVG(duration_ms)
FROM ai_interactions
WHERE provider = 'primary' AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY outcome;
```

## Project Structure

```
ticket-pipe/
├── src/
│   ├── index.ts                 # Express app entry point
│   ├── worker.ts                # Background worker process
│   ├── routes/
│   │   ├── tickets.ts           # Ticket API routes
│   │   └── health.ts            # Health check endpoint
│   ├── controllers/
│   │   └── tickets.ts           # Request handlers (validation, response formatting)
│   ├── services/
│   │   └── tickets.ts           # Business logic (create, list, etc.)
│   ├── repositories/
│   │   ├── tickets.ts           # Ticket table operations
│   │   ├── processing.ts        # Triage & draft results
│   │   └── events.ts            # Event log operations
│   └── lib/
│       ├── ai-service.ts        # Triage & draft execution
│       ├── ticket-graph.ts      # LangGraph orchestration
│       ├── ticket-phases.ts     # Phase state machine logic
│       ├── queue.ts             # AWS SQS wrapper
│       ├── socket.ts            # Socket.io initialization
│       ├── db.ts                # PostgreSQL connection pool
│       ├── logger.ts            # Pino logger setup
│       ├── errors.ts            # Custom error classes
│       └── reference.ts         # Reference number generation
├── migrations/                  # Database schema migrations
├── tests/                       # Test suite (Vitest)
├── public/                      # Static files (if any)
├── package.json                 # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── vitest.config.ts            # Test runner configuration
├── eslint.config.js            # Linting rules
├── .env.example                # Environment variables template
└── README.md                   # This file
```

## Development Guide

### Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- src/repositories/tickets.test.ts

# Get coverage report
npm test -- --coverage
```

**Test Structure**:
- `tests/` contains integration tests for repositories, services, and worker
- Tests use Vitest and Supertest for HTTP endpoint testing
- Database tests use a test database (configured in vitest.config.ts)

### Code Quality

```bash
# Run ESLint
npm run lint

# Format code with Prettier
npx prettier --write src/
```

### Local Development Workflow

1. **Start LocalStack** (if using Docker Compose):
   ```bash
   docker-compose up -d
   ```

2. **Run migrations**:
   ```bash
   npm run migrate
   ```

3. **Start the server** (Terminal 1):
   ```bash
   npm run dev
   ```

4. **Start the worker** (Terminal 2):
   ```bash
   npm run worker
   ```

5. **Make API requests** and monitor logs in both terminals

### Debugging

**Environment Variables for Debugging**:
```bash
DEBUG=*                  # Enable all debug logs
LANGCHAIN_VERBOSE=true   # Verbose LangChain output
```

**Logs**:
- API server logs appear in Terminal 1
- Worker logs appear in Terminal 2
- All logs include structured context (ticketId, phase, etc.)

**LangSmith Tracing**:
Visit [LangSmith](https://smith.langchain.com) to see traces of all LLM operations, including:
- Input prompts and parameters
- LLM outputs and reasoning
- Execution time and tokens used
- Any errors or retries
