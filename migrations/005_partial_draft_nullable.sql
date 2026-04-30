ALTER TABLE ticket_processing
  ALTER COLUMN customer_reply DROP NOT NULL,
  ALTER COLUMN internal_note DROP NOT NULL,
  ALTER COLUMN next_steps DROP NOT NULL;
