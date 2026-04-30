DELETE FROM ticket_processing a
USING ticket_processing b
WHERE a.ticket_id = b.ticket_id
  AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS ticket_processing_ticket_id_unique
  ON ticket_processing (ticket_id);
