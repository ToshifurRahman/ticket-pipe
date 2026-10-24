CREATE TABLE IF NOT EXISTS ticket_processing (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id        UUID        NOT NULL REFERENCES tickets(id),
  category         TEXT        NOT NULL,
  priority         TEXT        NOT NULL,
  sentiment        TEXT        NOT NULL,
  escalate         BOOLEAN     NOT NULL,
  recommended_team TEXT        NOT NULL,
  issue_summary    TEXT        NOT NULL,
  customer_reply   TEXT        NOT NULL,
  internal_note    TEXT        NOT NULL,
  next_steps       TEXT[]      NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
