# Ticket-Pipeline

An AI-powered ticket processing system that automatically analyzes support tickets, performs intelligent triage, and generates response drafts using LLMs. Built with Express.js, PostgreSQL, AWS SQS, and LangChain.

![Node.js](https://img.shields.io/badge/node.js-v20+-green) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13+-blue)

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Features](#features)
- [Project Structure](#project-structure)
- [Development Guide](#development-guide)

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
