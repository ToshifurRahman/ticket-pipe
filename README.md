# Ticket-Pipeline

An AI-powered ticket processing system that automatically analyzes support tickets, performs intelligent triage, and generates response drafts using LLMs. Built with Express.js, PostgreSQL, AWS SQS, and LangChain.

![Node.js](https://img.shields.io/badge/node.js-v20+-green) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13+-blue)

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Features](#features)
- [Web App](#web-app)
- [Ops Email Alerts](#ops-email-alerts)
- [Ticket History](#ticket-history)
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
- **Event Audit Trail**: Complete, permanent history of all state transitions and failures recorded as events (see [Ticket History](#ticket-history))
- **Ops Recovery**: Ops can send a `failed` or `needs_attention` ticket back through processing without the customer resubmitting (see [Ticket Recovery](#ticket-recovery))

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
is one of `ticket.submitted`, `triage.started`, `triage.completed`, `triage.failed`, `triage.invalid`,
`draft.started`, `draft.completed`, `draft.failed`, `draft.invalid`, `ticket.completed`, `ticket.failed`, `ticket.needs_attention`,
`ticket.requeued` or `ticket.requeue_failed`.

When a ticket runs out of retries, ops also receives `ticket:needs_attention` with
`{ ticketId, referenceNumber, reason, occurredAt }`. `reason` is one of `triage_retries_exhausted`,
`draft_retries_exhausted`, `incomplete_output` or `processing_result_missing`. It is a fixed code, never the
error message, because error messages can quote AI output or customer content. The full text stays in the
ticket's event history (`GET /api/tickets/:id`).

When ops replays a ticket, the room also receives `ticket:requeued` with
`{ ticketId, referenceNumber, previousStatus, occurredAt }`, where `previousStatus` is `failed` or `needs_attention`.

**Privacy boundary.** The ops room is visible to every ops subscriber, so only
`src/services/ops-feed.ts` may publish to it, and only identifiers, codes and timestamps. AI output (triage
findings and the draft reply) is delivered only to the ticket's own room, which only that customer joins.
`tests/ops-feed.guard.test.ts` fails if any other file publishes to the ops room.

Every event goes through `recordTicketEvent()` (`src/services/ticket-events.ts`), which writes the
`ticket_events` row and publishes to the feed, so the two cannot drift apart. Publishing is best-effort
and never affects ticket processing. Customers join only their own ticket room (`join` accepts a
ticket UUID and nothing else), so they cannot subscribe to the feed.

## Web App

The UI is a React single-page app in `web/` (Vite, TypeScript, Tailwind v4, shadcn/ui). It is a separate package with its own `package.json`; Express serves the built `web/dist` on the same origin as the API, with deep links such as `/t/<reference>` falling back to `index.html`.

```bash
# Development: API on :3000 plus the Vite dev server on :5173 (proxies /api and /socket.io)
npm run dev
npm run web:dev

# Production-style: build once, then Express serves it on :3000
npm run build
npm run dev
```

If `web/dist` has not been built, the API starts normally and logs a warning; only the UI is missing.

### Testing without an AI provider

`LLM_MODE=fake` returns canned triage and draft output at the provider boundary, so tickets complete without Portkey or any API key. Everything above that layer still runs for real (retries, validation, `ai_interactions` rows with model `fake`, events, notifications).

| Setting | Effect |
|---|---|
| `LLM_FAKE_DELAY_MS` | Delay per fake call (default `1500`, so the typing indicators are visible). Tests use `0`. |
| `[fake:invalid-triage]` in a description | Triage returns blank fields, so the ticket goes to `needs_attention` |
| `[fake:invalid-draft]` in a description | Draft returns a blank reply, so the ticket goes to `needs_attention` |

The API and the worker both refuse to start with `LLM_MODE=fake` when `NODE_ENV=production`, and with any `LLM_MODE` other than `real` or `fake`.

```bash
npm run test:web    # web unit tests (Vitest + Testing Library + MSW)
npm run test:e2e    # Playwright against the built app; needs `docker compose up -d`, `npm run migrate`, `npm run setup`
```

## Ops Email Alerts

The live feed only helps while someone has it open. When a ticket enters `needs_attention`, the worker also
publishes one alert to an AWS SNS topic, and SNS emails it to the ops address subscribed to that topic.

```
Subject: [Ticket Pipe] TICK-1791462896000-9F2A1C07 needs attention (incomplete_output)

Ticket TICK-1791462896000-9F2A1C07 needs attention.

Reference: TICK-1791462896000-9F2A1C07
Ticket ID: 3f6c…
Reason:    incomplete_output
Time:      2026-10-08T12:34:56.000Z

Replay it with POST /tickets/3f6c…/replay once the cause is fixed.
```

**What SNS is used for, and what it isn't.** SNS fans a message out to servers and people (email, SMS,
queues), which makes it the right tool for "tell ops by email". It can't push to a browser, so live updates
stay on Redis + Socket.io. It can't email customers either: only confirmed subscribers receive SNS email.
If several independent consumers ever need every ticket event, the same topic can fan out to one SQS queue
per consumer. That is the scaling direction, not something built here.

**Same privacy boundary as the ops feed.** The alert is built field by field from `OpsNeedsAttention`, so it
holds the reference number, ticket id, reason code and time, and never the subject, description, AI output or
error text. Only `src/services/ops-alerts.ts` may publish to SNS (`tests/ops-alerts.guard.test.ts`).

**Behaviour**
- One alert per ticket that actually moves into `needs_attention`. A redelivered message that finds the
  ticket already moved sends nothing.
- Best-effort: the worker doesn't wait for SNS. A failed or slow call (5s timeout, one retry) is logged and
  never fails or delays processing.
- Capped at `SNS_ALERT_MAX_PER_HOUR` (default 20) so a bad AI provider day can't flood the inbox or use up
  SNS's free 1,000 emails a month. Past the cap, alerts are dropped and one warning is logged per hour. The
  ticket and the live feed still have the event. The count is kept in memory, so the cap is per worker process
  and restarts with it.

**Configuration**

| Variable | Purpose |
|---|---|
| `SNS_TOPIC_ARN` | Turns alerts on. Unset (local dev, CI, or after the AWS free plan ends) means no alerts; everything else works unchanged. |
| `SNS_ENDPOINT` | LocalStack URL for local runs. Leave unset in production to use AWS. |
| `SNS_ALERT_MAX_PER_HOUR` | Hourly cap, default 20. |

To try it locally, `npm run setup` creates the `ticket-needs-attention` topic in LocalStack and prints its ARN.
Set `SNS_TOPIC_ARN` to it. LocalStack doesn't send email, so subscribe a queue to the topic to see the alerts
(as `tests/ops-alerts.localstack.test.ts` does). In production the topic, the email subscription (the recipient
must click the confirmation link) and `sns:Publish` on that topic for the app's IAM user are set up by hand.

## Ticket Recovery

Ops can send a ticket that ended `failed` or `needs_attention` back through processing. The customer does
nothing: their open ticket page gets a `ticket:update` with `ticket.requeued` and then follows the new
attempt live.

```bash
curl -X POST http://localhost:3000/api/tickets/<ticket-id>/replay
# 200 { "success": true, "status": "queued", "previousStatus": "failed" }
```

The ticket goes back to `queued`, its `failure_reason` and `failed_at` are cleared, and `ticket.requeued` is
recorded. Each replay is a new attempt with a fresh set of retries per stage.

A replay continues from where the ticket stopped. A stage that already completed successfully never runs
again: its saved output is reused.

- **Draft failed or its output was unusable** → only the draft runs again, using the saved triage.
- **Triage failed or its output was unusable** → triage runs again, and so does the draft, because it is
  written from the triage.
- **Finalizing failed** (both stages done) → no stage runs again; the ticket is only finalized.

Each stage's output is checked as soon as the stage runs. Unusable output is recorded as `triage.invalid` or
`draft.invalid`, and the ticket goes to `needs_attention` (`incomplete_output`). An invalid triage stops the
ticket before the draft is written. The marker tells a replay which stage to start from. Older
`needs_attention` tickets without a marker re-run any stage whose saved output is missing or unusable.

The worker skips a stage based on its **saved output**, not the event history. If a worker crashes after
saving a stage's output but before recording `*.completed`, the next attempt reuses that output and
records `*.completed` with the detail `reused stored output`. If the history says a stage completed but
its output is missing, the stage runs again.

| Response | When |
|---|---|
| `200` | The ticket was requeued. |
| `404` | No ticket with that id. |
| `409` | The ticket is not `failed` or `needs_attention` (its current `status` is in the body). Two replays at the same moment: one wins, the other gets `409`. |
| `503` | The message could not be sent to the queue. The ticket is put back exactly as it was, `ticket.requeue_failed` is recorded, and it can be replayed again. |

There is no limit on how many times a ticket can be replayed; every replay is in its history.

## Ticket History

Every ticket keeps its full event history forever, from `ticket.submitted` to its final outcome, so
support agents can look it up during a follow-up or dispute weeks later.

The status lookup (`GET /api/tickets/:id` or `GET /api/tickets/ref/:referenceNumber`) returns the first
50 events, oldest first, in `events`. If there are more, `eventsNextCursor` holds a cursor for the rest;
otherwise it is `null`. `phases` is always worked out from the whole history, not just that first page.

```bash
# The rest of the history, a page at a time. Keep passing nextCursor back as `after` until it is null.
curl "http://localhost:3000/api/tickets/<id>/events?limit=50"
# { "events": [{ "event": "ticket.submitted", "detail": "TKT-001", "occurredAt": "..." }, ...],
#   "nextCursor": "djE6MTIz" }
curl "http://localhost:3000/api/tickets/<id>/events?limit=50&after=djE6MTIz"
```

- `limit` defaults to 50 and is clamped to 1–200. An invalid `after` cursor returns `400`, and an unknown
  ticket returns `404`. Treat cursors as opaque.
- Events are ordered by `ticket_events.seq`, an identity column, so order is exact even when two events
  share a timestamp.
- **Append-only.** Database triggers (migration `008`) reject every `UPDATE`, `DELETE` and `TRUNCATE` on
  `ticket_events`, so history can't be lost by age, by a bug or by a stray query. Test cleanup opts in for a
  single transaction with `set_config('app.allow_event_purge', 'on', true)`; see
  `tests/helpers/purge-ticket-events.ts`. `tests/ticket-events.guard.test.ts` fails if code tries to change
  the table.

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
│   │   ├── tickets.ts           # Business logic (create, list, etc.)
│   │   └── ops-alerts.ts        # SNS email alerts for needs_attention tickets
│   ├── repositories/
│   │   ├── tickets.ts           # Ticket table operations
│   │   ├── processing.ts        # Triage & draft results
│   │   └── events.ts            # Event log operations
│   └── lib/
│       ├── ai-service.ts        # Triage & draft execution
│       ├── ticket-graph.ts      # LangGraph orchestration
│       ├── ticket-phases.ts     # Phase state machine logic
│       ├── queue.ts             # AWS SQS wrapper
│       ├── web-app.ts           # Serves web/dist with an SPA fallback
│       ├── sns.ts               # AWS SNS client (null when alerts are off)
│       ├── socket.ts            # Socket.io initialization
│       ├── db.ts                # PostgreSQL connection pool
│       ├── logger.ts            # Pino logger setup
│       ├── errors.ts            # Custom error classes
│       └── reference.ts         # Reference number generation
├── migrations/                  # Database schema migrations
├── tests/                       # Test suite (Vitest)
├── web/                         # React app (separate package; built to web/dist)
├── e2e/                         # Playwright smoke tests
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
