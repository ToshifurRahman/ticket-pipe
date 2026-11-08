# Abuse protection

Story 7.5. Three layers guard ticket submission, in a fixed order, so a bot or a repeat submitter
cannot spend the AI quota and an ordinary visitor sees no change.

## Layers and order

`POST /api/tickets` (`apps/api/src/controllers/tickets.ts`):

1. **Body validation** — the schema in `TicketSchema` (subject, description, `turnstileToken`).
   A bad body is a 400 with the usual field messages.
2. **Per-IP limit** — `tickets:ip:<ip>:<YYYY-MM-DDTHH>` in Redis, a one-hour fixed window.
   More than `TICKET_IP_HOURLY_LIMIT` hits is a 429 with `Retry-After: 3600`. The UTC hour is in
   the key so a key that somehow lost its TTL can block an address for one hour, never forever.
3. **Turnstile** — `apps/api/src/lib/turnstile.ts` posts `secret`, `response` and (unless the
   address is `local`) `remoteip` to Cloudflare's `siteverify` endpoint with a 5 s timeout.
   Only `missing-input-response`, `invalid-input-response` and `timeout-or-duplicate` count as a
   bad token (403). A bad secret, an internal error, a non-200, a malformed body, a network error
   or a timeout is an outage (503). The token and the secret are never logged.
4. **Daily cap** — `tickets:day:<YYYY-MM-DD>` (UTC), window 86400 + 3600 seconds. More than
   `TICKET_DAILY_CAP` is a 429 with `Retry-After` set to the seconds until the next UTC midnight.

Only after all four does the API call `createTicket`, which inserts the row and enqueues the SQS
message. A refused request creates no row, sends no email and enqueues nothing, so it costs no
LLM call.

`POST /api/tickets/:id/notification` (the email opt-in) validates its body and then verifies the
token the same way: a missing or bad token is the same 403, an outage the same 503. Its existing
per-IP limit and daily mail cap are unchanged.

## Configuration

| Variable                 | Default | Meaning                                                 |
| ------------------------ | ------- | ------------------------------------------------------- |
| `TURNSTILE_SECRET_KEY`   | —       | Cloudflare secret. Required when `NODE_ENV=production`. |
| `TICKET_IP_HOURLY_LIMIT` | 15      | Submissions per IP per UTC hour.                        |
| `TICKET_DAILY_CAP`       | 100     | New tickets per UTC day.                                |

Outside production an unset `TURNSTILE_SECRET_KEY` falls back to Cloudflare's always-pass test
secret (`1x0000000000000000000000000000000AA`) so development and tests keep working. Production
must set the real secret: a test secret must never be deployed. Test secrets are not refused by
the code, because the image smoke test runs in production mode with one.

## Outages

Both Redis (counters) and Cloudflare are bounded: `hitWithin` rejects after
`COUNTER_TIMEOUT_MS` = 2 s, and siteverify after `TURNSTILE_TIMEOUT_MS` = 5 s. Either failure is a
friendly 503, and nothing is created. The lazy Redis client queues commands while disconnected, so
the timeout — not the client — is what stops a hung request.

## What a ticket can cost

The counter counts tickets at submit. One ticket's worst case, derived from the code:

- `apps/api/src/worker.ts`: `MAX_ATTEMPTS = 3` applies separately to the triage and the draft
  stage, and `MAX_RECEIVES = 2 * MAX_ATTEMPTS` bounds message redelivery.
- `apps/api/src/lib/ai-service.ts`: each attempt tries the primary provider and, if a backup is
  configured, the backup provider as well.

So one ticket is at most **2 stages × 3 attempts × 2 provider calls = 12 LLM calls**. With the
defaults, one UTC day is at most `TICKET_DAILY_CAP` × 12 = **1200 LLM calls**. The audit's figure
of 12 matches the code. A capped or refused submission enqueues nothing, so it adds no LLM call.

## Tests

- `apps/api/tests/unit/lib/turnstile.test.ts` — the verifier's outcomes, form fields and timeout.
- `apps/api/tests/unit/lib/turnstile-config.test.ts` — defaults and the production rule.
- `apps/api/tests/unit/lib/counters.test.ts` — `hitWithin` and its timeout.
- `apps/api/tests/unit/services/submission-guard.test.ts` — keys, windows, messages, `Retry-After`.
- `apps/api/tests/api/tickets/abuse-protection.test.ts` — both routes against real Postgres and Redis.
- `apps/api/tests/integration/lib/turnstile-live.test.ts` — a real siteverify call with Cloudflare's
  test keys.
- `e2e/abuse-protection.spec.ts` — the real stack and the form's friendly messages.
