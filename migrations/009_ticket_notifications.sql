-- Story 6.9: a customer's opt-in to email. One row per ticket, kept apart from `tickets` so the
-- address cannot ride along on a ticket query by accident. Deleted with the ticket (cascade for
-- tests and manual deletes; the retention purge also deletes it explicitly).
CREATE TABLE IF NOT EXISTS ticket_notifications (
  ticket_id             UUID PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
  email                 TEXT NOT NULL,
  token_hash            TEXT UNIQUE,
  token_expires_at      TIMESTAMPTZ,
  confirmed_at          TIMESTAMPTZ,
  snag_notified_at      TIMESTAMPTZ,
  completed_notified_at TIMESTAMPTZ,
  last_error            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
