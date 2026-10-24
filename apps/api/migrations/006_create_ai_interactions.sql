CREATE TABLE IF NOT EXISTS ai_interactions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id         UUID        NOT NULL REFERENCES tickets(id),
  operation         TEXT        NOT NULL CHECK (operation IN ('triage', 'draft')),
  provider          TEXT        NOT NULL CHECK (provider IN ('primary', 'backup')),
  model             TEXT        NOT NULL,
  outcome           TEXT        NOT NULL CHECK (outcome IN ('success', 'http_error', 'network_error', 'timeout', 'invalid_response')),
  http_status       INTEGER,
  duration_ms       INTEGER     NOT NULL,
  error_message     TEXT,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_interactions_created_at ON ai_interactions (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_interactions_ticket_id ON ai_interactions (ticket_id);
