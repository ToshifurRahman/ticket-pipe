# Ticket-Pipeline

An AI-powered ticket processing system that automatically analyzes support tickets, performs intelligent triage, and generates response drafts using LLMs. Built with Express.js, PostgreSQL, AWS SQS, and LangChain.

![Node.js](https://img.shields.io/badge/node.js-v20+-green) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13+-blue)

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Features](#features)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Database Schema](#database-schema)
- [Environment Variables](#environment-variables)
- [Development Guide](#development-guide)
- [Processing Pipeline](#processing-pipeline)
- [WebSocket Events](#websocket-events)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Quick Start

### Prerequisites

- **Node.js** v20 or higher
- **PostgreSQL** 13 or higher
- **AWS Account** (for SQS)
- **API Keys**:
  - GROQ API Key (for LLM inference)
  - Portkey API Key (for AI gateway & fallback routing)
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

#### 4. **AI Service** (`src/lib/ai-service.ts` & `src/lib/ticket-graph.ts`)
- **Triage Phase**: Analyzes ticket to determine category, priority, sentiment, escalation needs, and recommended team
- **Draft Phase**: Generates customer-facing reply, internal notes, and next action steps
- Uses LangGraph for orchestration across multiple LLM calls
- Integrates with Portkey for fallback routing and observability
- Traces all AI operations to LangSmith for debugging and optimization

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
- **LangSmith Integration**: Full tracing of all LLM operations for observability and prompt optimization
- **Socket.io Integration**: Real-time bi-directional communication for ops alerts

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

## API Documentation

### Base URL
```
http://localhost:3000/api
```

### 1. Create Ticket
**Endpoint**: `POST /tickets`

**Request**:
```bash
curl -X POST http://localhost:3000/api/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Cannot reset password",
    "description": "I clicked the reset link but it expired. When I try again, nothing happens."
  }'
```

**Request Body**:
```json
{
  "subject": "string (required, min 1 char)",
  "description": "string (required, min 1 char)"
}
```

**Response** (201 Created):
```json
{
  "ticketId": "550e8400-e29b-41d4-a716-446655440000",
  "referenceNumber": "TKT-001",
  "status": "queued",
  "createdAt": "2026-04-30T11:05:37.964Z"
}
```

**Error Responses**:
- `400 Bad Request`: Missing/invalid subject or description
- `500 Internal Server Error`: Database or queue error

---

### 2. Get Ticket by ID
**Endpoint**: `GET /tickets/:id`

**Request**:
```bash
curl http://localhost:3000/api/tickets/550e8400-e29b-41d4-a716-446655440000
```

**Response** (200 OK):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "referenceNumber": "TKT-001",
  "subject": "Cannot reset password",
  "status": "completed",
  "createdAt": "2026-04-30T11:05:37.964Z",
  "events": [
    {
      "id": "event-uuid-1",
      "ticketId": "550e8400-e29b-41d4-a716-446655440000",
      "event": "triage.started",
      "detail": null,
      "occurredAt": "2026-04-30T11:05:40.000Z"
    },
    {
      "id": "event-uuid-2",
      "ticketId": "550e8400-e29b-41d4-a716-446655440000",
      "event": "triage.completed",
      "detail": null,
      "occurredAt": "2026-04-30T11:05:45.000Z"
    }
  ],
  "phases": {
    "triage": {
      "status": "completed",
      "output": {
        "category": "Account",
        "priority": "High",
        "sentiment": "Frustrated",
        "escalate": false,
        "recommendedTeam": "Account Recovery",
        "issueSummary": "User cannot complete password reset due to expired link."
      }
    },
    "draft": {
      "status": "completed",
      "output": {
        "customerReply": "Thank you for reaching out. I understand how frustrating this must be...",
        "internalNote": "Account verification needed. User has valid email.",
        "nextActions": ["Send new reset link", "Monitor email delivery"]
      }
    }
  }
}
```

**Response Status Values**: `queued`, `processing`, `completed`, `failed`, `needs_attention`

**Error Responses**:
- `404 Not Found`: Ticket doesn't exist

---

### 3. Get Ticket by Reference Number
**Endpoint**: `GET /tickets/ref/:referenceNumber`

**Request**:
```bash
curl http://localhost:3000/api/tickets/ref/TKT-001
```

**Response**: Same as "Get Ticket by ID" endpoint

---

### 4. List Tickets
**Endpoint**: `GET /tickets`

**Query Parameters**:
- `page` (optional, default: 1): Page number for pagination
- `limit` (optional, default: 20, max: 100): Results per page
- `status` (optional): Comma-separated statuses to filter (e.g., `queued,processing,completed`)
- `sort` (optional, default: `createdAt`): Sort field (`createdAt` or `status`)
- `order` (optional, default: `desc`): Sort order (`asc` or `desc`)

**Request**:
```bash
curl "http://localhost:3000/api/tickets?page=1&limit=10&status=completed,failed&sort=createdAt&order=desc"
```

**Response** (200 OK):
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "referenceNumber": "TKT-001",
      "subject": "Cannot reset password",
      "status": "completed",
      "createdAt": "2026-04-30T11:05:37.964Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

---

### 5. Replay Failed Ticket
**Endpoint**: `POST /tickets/:id/replay`

Requeues a failed ticket for reprocessing.

**Request**:
```bash
curl -X POST http://localhost:3000/api/tickets/550e8400-e29b-41d4-a716-446655440000/replay
```

**Response** (200 OK):
```json
{
  "success": true,
  "status": "queued"
}
```

**Error Responses**:
- `400 Bad Request`: Ticket status is not `failed`
- `404 Not Found`: Ticket doesn't exist

---

### 6. Health Check
**Endpoint**: `GET /health`

**Request**:
```bash
curl http://localhost:3000/health
```

**Response** (200 OK):
```json
{
  "status": "ok"
}
```

---

## Database Schema

### tickets
Stores basic ticket information and current status.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique ticket identifier |
| `reference_number` | TEXT | UNIQUE NOT NULL | Human-readable ticket number (TKT-XXX) |
| `subject` | TEXT | NOT NULL | Ticket subject line |
| `description` | TEXT | NOT NULL | Full ticket description/issue details |
| `status` | TEXT | NOT NULL, DEFAULT 'queued' | Current processing status |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Ticket creation timestamp |

**Statuses**: `queued`, `processing`, `completed`, `failed`, `needs_attention`

---

### ticket_processing
Stores AI triage results and draft response output.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique processing result ID |
| `ticket_id` | UUID | NOT NULL, FOREIGN KEY | Reference to ticket |
| `category` | TEXT | NOT NULL | Issue category (e.g., "Account", "Billing") |
| `priority` | TEXT | NOT NULL | Priority level (e.g., "Low", "High") |
| `sentiment` | TEXT | NOT NULL | Customer sentiment (e.g., "Neutral", "Frustrated") |
| `escalate` | BOOLEAN | NOT NULL | Whether ticket should be escalated |
| `recommended_team` | TEXT | NOT NULL | Suggested team to handle ticket |
| `issue_summary` | TEXT | NOT NULL | AI-generated summary of the issue |
| `customer_reply` | TEXT | Nullable | AI-generated customer-facing response |
| `internal_note` | TEXT | Nullable | Internal notes for support team |
| `next_steps` | TEXT[] | NOT NULL | Array of recommended next actions |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Unique Constraint**: Only one processing result per ticket (UNIQUE on `ticket_id`)

---

### ticket_events
Audit log of all ticket state transitions and processing events.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique event identifier |
| `ticket_id` | UUID | NOT NULL, FOREIGN KEY | Reference to ticket |
| `event` | TEXT | NOT NULL | Event type (e.g., "triage.started", "draft.failed") |
| `detail` | TEXT | Nullable | Additional event context or error details |
| `occurred_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Event timestamp |

**Index**: `(ticket_id, occurred_at)` for efficient filtering

**Event Types**:
- `triage.started` — Triage phase began
- `triage.completed` — Triage succeeded
- `triage.failed` — Triage failed (will retry)
- `draft.started` — Draft generation began
- `draft.completed` — Draft generation succeeded
- `draft.failed` — Draft generation failed (will retry)
- `ticket.escalated` — Escalated to ops team

---

## Environment Variables

Copy `.env.example` to `.env` and configure these variables:

```bash
# Server Configuration
PORT=3000

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/ticket_pipe

# AWS SQS
SQS_ENDPOINT=http://localhost:4566          # LocalStack endpoint for local dev
SQS_QUEUE_NAME=ticket-processing
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test                      # Dummy values for LocalStack
AWS_SECRET_ACCESS_KEY=test

# Worker Configuration
WORKER_CONCURRENCY=10                       # Number of concurrent ticket processors

# LLM & AI Services
GROQ_API_KEY=your_groq_api_key_here        # GROQ for fast LLM inference
PORTKEY_API_KEY=your_portkey_api_key_here  # Portkey for routing & fallbacks

# LangChain & Observability
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your_langsmith_key_here  # LangSmith for tracing
LANGCHAIN_PROJECT=ticket-pipe
LANGCHAIN_TRIAGE_PROMPT=username/ticket-pipe-triage     # Triage prompt ID in LangSmith
LANGCHAIN_DRAFT_PROMPT=username/ticket-pipe-draft       # Draft prompt ID in LangSmith
```

**Local Development Setup**:
For local development with Docker Compose (LocalStack + PostgreSQL), the `.env.example` provides sensible defaults. Just add your API keys.

---

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

---

## Processing Pipeline

### Ticket Lifecycle

```
User Submits Ticket
        ↓
   Validated & Queued (status: queued)
        ↓
[TRIAGE PHASE]
        ↓
  triage.started (event)
        ↓
  LLM Analyzes: Category, Priority, Sentiment, Escalation, Team
        ↓
  Results Saved (status: processing)
        ↓
  triage.completed (event)
        ↓ (if failed: triage.failed → retry with backoff)
[DRAFT PHASE]
        ↓
  draft.started (event)
        ↓
  LLM Generates: Customer Reply, Internal Notes, Next Steps
        ↓
  Results Saved
        ↓
  draft.completed (event)
        ↓ (if failed: draft.failed → retry with backoff)
[COMPLETION]
        ↓
  Ticket Status Updated (status: completed)
        ↓
  Real-time Event Broadcast (Socket.io)
        ↓
  User Sees Results
```

### Triage Phase (Detailed)

**Input**:
- `ticketId`: Unique ticket identifier
- `subject`: Ticket subject line
- `description`: Full issue description

**Processing**:
1. LLM analyzes the ticket content
2. Extracts structured information:
   - **Category**: Issue domain (e.g., "Account", "Billing", "Technical")
   - **Priority**: Urgency level (e.g., "Low", "Medium", "High", "Critical")
   - **Sentiment**: Customer emotion (e.g., "Neutral", "Satisfied", "Frustrated", "Angry")
   - **Escalate**: Boolean flag if issue needs immediate attention
   - **Recommended Team**: Which support team should handle it
   - **Issue Summary**: Concise description of the problem

**Output**:
```json
{
  "category": "Account",
  "priority": "High",
  "sentiment": "Frustrated",
  "escalate": true,
  "recommendedTeam": "Account Recovery",
  "issueSummary": "User cannot access account due to forgotten password"
}
```

### Draft Phase (Detailed)

**Input**:
- Ticket subject and description
- Triage results from previous phase

**Processing**:
1. LLM uses triage output to contextualize response generation
2. Generates three outputs:
   - **Customer Reply**: Empathetic, helpful response to send to customer
   - **Internal Note**: Instructions/context for support team
   - **Next Steps**: Array of recommended follow-up actions

**Output**:
```json
{
  "customerReply": "Thank you for contacting us. We understand how frustrating password issues can be. We're sending you a new reset link that will expire in 24 hours...",
  "internalNote": "Verify account email is valid. Check for any failed login attempts (security flag). Send password reset via secure link.",
  "nextActions": ["Send reset email", "Monitor for confirmation within 24h", "Escalate if not confirmed"]
}
```

### Retry & Escalation Logic

**Retry Behavior**:
- Each phase (triage, draft) retries independently
- Maximum 3 attempts per phase (configurable)
- Exponential backoff between retries: 2s, 5s, 10s

**Escalation Conditions**:
- When max retries exceeded on any phase
- When `escalate` flag is true in triage output
- Ticket status updated to `needs_attention`
- Ops team alerted via `ticket:needs_attention` WebSocket event

**Resume Failed Tickets**:
```bash
# Check status
curl http://localhost:3000/api/tickets/ticket-id

# If status is "failed", replay the ticket
curl -X POST http://localhost:3000/api/tickets/ticket-id/replay
```

---

## WebSocket Events

Connect via Socket.io to receive real-time updates.

**Client Connection**:
```javascript
const socket = io('http://localhost:3000');

// Join a ticket room
socket.emit('join', 'ticket-uuid');

// Listen for updates
socket.on('ticket:update', (data) => {
  console.log('Ticket event:', data.event);
  // { event: 'triage.started', ticketId: '...', occurredAt: '...' }
});

// Listen for ops alerts
socket.on('ticket:needs_attention', (data) => {
  console.log('Ops alert:', data);
  // { ticketId: '...', detail: 'Max retries exceeded', occurredAt: '...' }
});
```

**Event Stream**:
As a ticket progresses, you'll receive events in order:
1. `triage.started`
2. `triage.completed` (or `triage.failed` then retry)
3. `draft.started`
4. `draft.completed` (or `draft.failed` then retry)
5. `ticket.completed` (status update)

---

## Contributing

### Development Workflow

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes** and commit:
   ```bash
   git add src/...
   git commit -m "feat: description of changes"
   ```

3. **Run tests and linting**:
   ```bash
   npm test
   npm run lint
   ```

4. **Push and open a Pull Request**:
   ```bash
   git push origin feature/your-feature-name
   ```

### Code Style Guidelines

- **TypeScript**: Strict mode enabled, no `any` types
- **Naming**: camelCase for variables/functions, PascalCase for classes/types
- **Formatting**: Prettier + ESLint enforce consistency
- **Comments**: Only for non-obvious logic; prefer clear code over comments
- **Error Handling**: Use custom error types; log with context

### Testing Requirements

- All new features must include tests
- Tests should cover happy path and error cases
- Integration tests preferred over unit tests where applicable
- Target coverage: 80%+ for business logic

### Commit Message Format

```
<type>: <description>

<optional body explaining changes>

Fixes #<issue-number> (if applicable)
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

---

## Troubleshooting

### Common Issues

#### 1. "Database connection failed"
**Symptoms**: Server won't start, error mentions PostgreSQL

**Solutions**:
```bash
# Check DATABASE_URL in .env
echo $DATABASE_URL

# Verify PostgreSQL is running
psql $DATABASE_URL -c "SELECT 1;"

# Run migrations
npm run migrate
```

#### 2. "Failed to receive SQS messages"
**Symptoms**: Worker starts but no tickets are processed

**Solutions**:
```bash
# Check SQS_QUEUE_NAME exists
aws sqs list-queues --endpoint-url=$SQS_ENDPOINT

# Verify AWS credentials
echo $AWS_ACCESS_KEY_ID

# Check LocalStack is running (if using Docker)
docker ps | grep localstack
```

#### 3. "GROQ_API_KEY not set" or similar API errors
**Solutions**:
```bash
# Verify .env file exists and contains all required keys
cat .env | grep -E "GROQ|PORTKEY|LANGCHAIN"

# Ensure no quotes around values
# ✗ GROQ_API_KEY="value"
# ✓ GROQ_API_KEY=value
```

#### 4. WebSocket connection fails
**Symptoms**: Socket.io client can't connect to server

**Solutions**:
- Ensure server is running: `npm run dev`
- Check PORT in .env (default 3000)
- Verify no CORS issues if client is on different domain
- Check browser console for detailed error

#### 5. "Triage/Draft phase not completing"
**Symptoms**: Ticket stuck in "processing" status

**Solutions**:
```bash
# Check worker is running: npm run worker
# Check LLM API keys are valid and not rate-limited
# Check logs for LangSmith tracing errors
# Manually trigger replay after fixing the issue:
curl -X POST http://localhost:3000/api/tickets/ticket-id/replay
```

### Debug Mode

Enable verbose logging:

```bash
# Terminal 1
DEBUG=* npm run dev

# Terminal 2
DEBUG=* npm run worker
```

### Getting Help

1. Check logs in both server and worker terminals
2. Review LangSmith traces for AI operation failures
3. Check PostgreSQL logs for database issues
4. Verify environment variables are set correctly

---

## License

[Add your license here - e.g., MIT]

## Authors

- Original development: [Your Name/Team]

---

## Additional Resources

- **LangChain Documentation**: https://js.langchain.com/
- **LangGraph**: https://langchain-ai.github.io/langgraphjs/
- **Portkey Docs**: https://docs.portkey.ai/
- **GROQ API**: https://console.groq.com/docs/
- **LangSmith**: https://smith.langchain.com/
- **AWS SQS**: https://docs.aws.amazon.com/sqs/
- **Express.js**: https://expressjs.com/
- **Socket.io**: https://socket.io/docs/

---

## Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check existing issues first
- Include relevant logs and environment details
