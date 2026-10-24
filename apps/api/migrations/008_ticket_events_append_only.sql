-- Story 5.3: ticket history is permanent and fully ordered.

-- 1. `seq` gives every event a strict, insertion-ordered position. occurred_at can tie and
--    the id is a random UUID, so neither can back a pagination cursor. Existing rows are
--    numbered in (occurred_at, id) order, the best order available for them.
ALTER TABLE ticket_events ADD COLUMN IF NOT EXISTS seq BIGINT;

UPDATE ticket_events e
SET seq = n.rn
FROM (SELECT id, row_number() OVER (ORDER BY occurred_at, id) AS rn FROM ticket_events) n
WHERE e.id = n.id;

ALTER TABLE ticket_events ALTER COLUMN seq SET NOT NULL;
ALTER TABLE ticket_events ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY;
SELECT setval(
  pg_get_serial_sequence('ticket_events', 'seq'),
  COALESCE((SELECT MAX(seq) FROM ticket_events), 0) + 1,
  false
);
ALTER TABLE ticket_events ADD CONSTRAINT ticket_events_seq_key UNIQUE (seq);

CREATE INDEX IF NOT EXISTS ticket_events_ticket_id_seq ON ticket_events (ticket_id, seq);

-- 2. Events are append-only. Nothing may change or remove history, unless the current
--    transaction has opted in with `SELECT set_config('app.allow_event_purge', 'on', true)`.
--    Only test cleanup does that (tests/helpers/purge-ticket-events.ts). The setting is
--    transaction-local, so it can't leak to other users of a pooled connection.
CREATE OR REPLACE FUNCTION ticket_events_append_only() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.allow_event_purge', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'ticket_events is append-only (% rejected)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ticket_events_no_update_delete ON ticket_events;
CREATE TRIGGER ticket_events_no_update_delete
  BEFORE UPDATE OR DELETE ON ticket_events
  FOR EACH ROW EXECUTE FUNCTION ticket_events_append_only();

DROP TRIGGER IF EXISTS ticket_events_no_truncate ON ticket_events;
CREATE TRIGGER ticket_events_no_truncate
  BEFORE TRUNCATE ON ticket_events
  FOR EACH STATEMENT EXECUTE FUNCTION ticket_events_append_only();
