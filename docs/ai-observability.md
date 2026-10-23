# AI observability

Every call to an LLM provider (primary or backup, per triage/draft attempt) is recorded in the
`ai_interactions` table with its outcome, duration, and token usage. The AI call itself is never
blocked or failed by a recording error — a failed write is logged and the ticket keeps processing.

**Outcome values**: `success`, `http_error` (non-2xx response, with `http_status`), `network_error`
(the request itself failed), `timeout` (exceeded `AI_TIMEOUT_MS`, default 30s), `invalid_response`
(malformed or schema-invalid model output).

**Ops endpoints**:
- `GET /api/ops/ai-interactions` — paginated list, filterable by `provider`, `operation`, `outcome`,
  `ticketId`, `since`/`until`
- `GET /api/ops/ai-interactions/summary` — per `operation`+`provider` counts, success rate, average/p50/p95
  duration, and total token usage, over a `since`/`until` window (defaults to the last 24h)

**Example queries** (via `psql`):
```sql
-- Recent failures, most recent first
SELECT ticket_id, operation, provider, outcome, http_status, error_message, created_at
FROM ai_interactions
WHERE outcome != 'success'
ORDER BY created_at DESC
LIMIT 20;

-- Primary provider health over the last hour
SELECT outcome, COUNT(*), AVG(duration_ms)
FROM ai_interactions
WHERE provider = 'primary' AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY outcome;
```

