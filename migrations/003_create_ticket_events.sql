CREATE TABLE IF NOT EXISTS ticket_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID        NOT NULL REFERENCES tickets(id),
  event       TEXT        NOT NULL,
  detail      TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ticket_events_ticket_id_occurred_at
  ON ticket_events (ticket_id, occurred_at);
