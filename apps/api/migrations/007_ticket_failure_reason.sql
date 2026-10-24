ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_failure_reason_check;
ALTER TABLE tickets
  ADD CONSTRAINT tickets_failure_reason_check
  CHECK (failure_reason IS NULL OR failure_reason IN (
    'triage_retries_exhausted',
    'draft_retries_exhausted',
    'finalize_failed',
    'processing_error'
  ));
