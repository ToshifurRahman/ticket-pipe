# Ticket history

Every ticket keeps its full event history forever, from `ticket.submitted` to its final outcome, so
support agents can look it up during a follow-up or dispute weeks later.

The status lookup (`GET /api/tickets/:id` or `GET /api/tickets/ref/:referenceNumber`) returns the first
50 events, oldest first, in `events`. If there are more, `eventsNextCursor` holds a cursor for the rest;
otherwise it is `null`. `phases` is always worked out from the whole history, not just that first page.

```bash
# The rest of the history, a page at a time. Keep passing nextCursor back as `after` until it is null.
curl "http://localhost:3000/api/tickets/<id>/events?limit=50"
# { "events": [{ "event": "ticket.submitted", "occurredAt": "..." }, ...],
#   "nextCursor": "djE6MTIz" }
curl "http://localhost:3000/api/tickets/<id>/events?limit=50&after=djE6MTIz"
```

- The public routes leave out each event's `detail`. `GET /api/ops/tickets/:id/events` pages the same
  history with `detail` included.
- `limit` defaults to 50 and is clamped to 1–200. An invalid `after` cursor returns `400`, and an unknown
  ticket returns `404`. Treat cursors as opaque.
- Events are ordered by `ticket_events.seq`, an identity column, so order is exact even when two events
  share a timestamp.
- **Append-only.** Database triggers (migration `008`) reject every `UPDATE`, `DELETE` and `TRUNCATE` on
  `ticket_events`, so history can't be lost by age, by a bug or by a stray query. Test cleanup opts in for a
  single transaction with `set_config('app.allow_event_purge', 'on', true)`; see
  `tests/helpers/purge-ticket-events.ts`. `tests/ticket-events.guard.test.ts` fails if code tries to change
  the table.

