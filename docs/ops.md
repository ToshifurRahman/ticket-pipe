# Ops

Staff-only features: live feed, sign-in, email alerts and ticket recovery.

## Ops Live Feed

Ops staff can watch every ticket event across the organization over Socket.io. The feed carries
status information only. It never includes the subject, description, AI output or an event's error text.

```js
const socket = io('http://localhost:3000');
socket.on('ops:ticket_event', (e) => console.log(e));
await socket.emitWithAck('ops:subscribe'); // resolves to { ok: true } once subscribed
```

Each `ops:ticket_event` payload is `{ ticketId, referenceNumber, event, occurredAt }`, where `event`
is one of `ticket.submitted`, `triage.started`, `triage.completed`, `triage.failed`, `triage.invalid`,
`draft.started`, `draft.completed`, `draft.failed`, `draft.invalid`, `ticket.completed`, `ticket.failed`, `ticket.needs_attention`,
`ticket.requeued` or `ticket.requeue_failed`.

When a ticket runs out of retries, ops also receives `ticket:needs_attention` with
`{ ticketId, referenceNumber, reason, occurredAt }`. `reason` is one of `triage_retries_exhausted`,
`draft_retries_exhausted`, `incomplete_output` or `processing_result_missing`. It is a fixed code, never the
error message, because error messages can quote AI output or customer content. The full text stays in the
ticket's event history (`GET /api/ops/tickets/:id`).

When ops replays a ticket, the room also receives `ticket:requeued` with
`{ ticketId, referenceNumber, previousStatus, occurredAt }`, where `previousStatus` is `failed` or `needs_attention`.

**Privacy boundary.** The ops room is visible to every ops subscriber, so only
`src/services/ops-feed.ts` may publish to it, and only identifiers, codes and timestamps. The ticket's own
room, which only that customer joins, gets `ticket:update` with `{ event, ticketId, occurredAt }` and no AI
output either: the page reads the reply from the public lookup.
`tests/ops-feed.guard.test.ts` fails if any other file publishes to the ops room.

Every event goes through `recordTicketEvent()` (`src/services/ticket-events.ts`), which writes the
`ticket_events` row and publishes to the feed, so the two cannot drift apart. Publishing is best-effort
and never affects ticket processing. Customers join only their own ticket room (`join` accepts a
ticket UUID and nothing else), so they cannot subscribe to the feed.


## Ops sign-in

Everything staff-only sits behind a session: the ticket list (`GET /api/tickets`), replay, all of
`/api/ops/*` and the `ops:subscribe` socket room. Customers need nothing: submitting a ticket, reading it by id or
reference, and its live updates stay public.

| Endpoint | Behaviour |
| --- | --- |
| `POST /api/ops/session` `{ "token": "…" }` | `200` and a session cookie when the token matches `OPS_TOKEN`. `401` for a wrong one, `429` after 5 wrong tries from one address in 15 minutes, `503` when `OPS_TOKEN` is not set. |
| `GET /api/ops/session` | `{ "signedIn": true, "expiresAt": "…" }` or `{ "signedIn": false }`. Never `401`. |
| `DELETE /api/ops/session` | `204`. Ends the session on the server and disconnects its live ops sockets (`ops:revoked`). |

The cookie is `HttpOnly; Secure; SameSite=Strict` and holds a random 256-bit id. The server keeps only its SHA-256
in Redis (`ops:session:<hash>`) with a fixed 12 hour life, so signing out really ends the session, and a copied
cookie is useless afterwards. `SameSite=Strict` on one origin is the CSRF protection; the token never reaches
browser storage. `ops:subscribe` reads the same cookie from the socket handshake and acks
`{ ok: false, error: 'unauthorized' }` without one; a subscribed socket is removed from the room when its session
is signed out or expires.

`OPS_TOKEN` is required in production and must be at least 32 characters (`openssl rand -base64 32`). The
brute-force counter uses the last `X-Forwarded-For` hop, which is the address the hosting proxy saw.


## Ops Email Alerts

The live feed only helps while someone has it open. When a ticket enters `needs_attention`, the worker also
publishes one alert to an AWS SNS topic, and SNS emails it to the ops address subscribed to that topic.

```
Subject: [Ticket Pipe] TICK-1791462896000-9F2A1C07 needs attention (incomplete_output)

Ticket TICK-1791462896000-9F2A1C07 needs attention.

Reference: TICK-1791462896000-9F2A1C07
Ticket ID: 3f6c…
Reason:    incomplete_output
Time:      2026-10-08T12:34:56.000Z

Replay it from the ops console (or POST /api/tickets/3f6c…/replay with an ops session) once the cause is fixed.
```

**What SNS is used for, and what it isn't.** SNS fans a message out to servers and people (email, SMS,
queues), which makes it the right tool for "tell ops by email". It can't push to a browser, so live updates
stay on Redis + Socket.io. It can't email customers either: only confirmed subscribers receive SNS email.
If several independent consumers ever need every ticket event, the same topic can fan out to one SQS queue
per consumer. That is the scaling direction, not something built here.

**Same privacy boundary as the ops feed.** The alert is built field by field from `OpsNeedsAttention`, so it
holds the reference number, ticket id, reason code and time, and never the subject, description, AI output or
error text. Only `src/services/ops-alerts.ts` may publish to SNS (`tests/ops-alerts.guard.test.ts`).

**Behaviour**
- One alert per ticket that actually moves into `needs_attention`. A redelivered message that finds the
  ticket already moved sends nothing.
- Best-effort: the worker doesn't wait for SNS. A failed or slow call (5s timeout, one retry) is logged and
  never fails or delays processing.
- Capped at `SNS_ALERT_MAX_PER_HOUR` (default 20) so a bad AI provider day can't flood the inbox or use up
  SNS's free 1,000 emails a month. Past the cap, alerts are dropped and one warning is logged per hour. The
  ticket and the live feed still have the event. The count is kept in memory, so the cap is per worker process
  and restarts with it.

**Configuration**

| Variable | Purpose |
|---|---|
| `SNS_TOPIC_ARN` | Turns alerts on. Unset (local dev, CI, or after the AWS free plan ends) means no alerts; everything else works unchanged. |
| `SNS_ENDPOINT` | LocalStack URL for local runs. Leave unset in production to use AWS. |
| `SNS_ALERT_MAX_PER_HOUR` | Hourly cap, default 20. |

To try it locally, `bun run setup` creates the `ticket-needs-attention` topic in LocalStack and prints its ARN.
Set `SNS_TOPIC_ARN` to it. LocalStack doesn't send email, so subscribe a queue to the topic to see the alerts
(as `tests/ops-alerts.localstack.test.ts` does). In production the topic, the email subscription (the recipient
must click the confirmation link) and `sns:Publish` on that topic for the app's IAM user are set up by hand.


## Ticket Recovery

Ops can send a ticket that ended `failed` or `needs_attention` back through processing. The customer does
nothing: their open ticket page gets a `ticket:update` with `ticket.requeued` and then follows the new
attempt live.

Replay is staff-only: sign in first (see [Ops sign-in](#ops-sign-in)).

```bash
curl -c jar -H 'content-type: application/json' -d '{"token":"<OPS_TOKEN>"}' http://localhost:3000/api/ops/session
curl -b jar -X POST http://localhost:3000/api/tickets/<ticket-id>/replay
# 200 { "success": true, "status": "queued", "previousStatus": "failed" }
```

The ticket goes back to `queued`, its `failure_reason` and `failed_at` are cleared, and `ticket.requeued` is
recorded. Each replay is a new attempt with a fresh set of retries per stage.

A replay continues from where the ticket stopped. A stage that already completed successfully never runs
again: its saved output is reused.

- **Draft failed or its output was unusable** → only the draft runs again, using the saved triage.
- **Triage failed or its output was unusable** → triage runs again, and so does the draft, because it is
  written from the triage.
- **Finalizing failed** (both stages done) → no stage runs again; the ticket is only finalized.

Each stage's output is checked as soon as the stage runs. Unusable output is recorded as `triage.invalid` or
`draft.invalid`, and the ticket goes to `needs_attention` (`incomplete_output`). An invalid triage stops the
ticket before the draft is written. The marker tells a replay which stage to start from. Older
`needs_attention` tickets without a marker re-run any stage whose saved output is missing or unusable.

The worker skips a stage based on its **saved output**, not the event history. If a worker crashes after
saving a stage's output but before recording `*.completed`, the next attempt reuses that output and
records `*.completed` with the detail `reused stored output`. If the history says a stage completed but
its output is missing, the stage runs again.

| Response | When |
|---|---|
| `200` | The ticket was requeued. |
| `404` | No ticket with that id. |
| `409` | The ticket is not `failed` or `needs_attention` (its current `status` is in the body). Two replays at the same moment: one wins, the other gets `409`. |
| `503` | The message could not be sent to the queue. The ticket is put back exactly as it was, `ticket.requeue_failed` is recorded, and it can be replayed again. |

There is no limit on how many times a ticket can be replayed; every replay is in its history.

