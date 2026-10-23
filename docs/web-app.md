# Web app

The UI is a React single-page app in `web/` (Vite, TypeScript, Tailwind v4, shadcn/ui). It is a separate package with its own `package.json`; the API serves the built `web/dist` on the same origin as the API, with deep links such as `/t/<reference>` falling back to `index.html`.

```bash
# Development: API on :3000 plus the Vite dev server on :5173 (proxies /api and /socket.io)
bun run dev
bun run web:dev

# Production-style: build once, then the API serves it on :3000
bun run build
bun run dev
```

If `web/dist` has not been built, the API starts normally and logs a warning; only the UI is missing.

### Submitting a ticket (`/new`)

`POST /api/tickets` accepts a subject of 3–120 characters and a description of 20–5000, counted after trimming; anything outside that is a 400 `{ "errors": { "<field>": "<message>" } }`. The form checks the same limits inline, with the same messages, before it sends anything.

The form carries a Cloudflare Turnstile check and sends its token as `turnstileToken`. The API does not verify the token yet. Set the site key at build time with `VITE_TURNSTILE_SITE_KEY`; when it is unset, Cloudflare's always-pass test key is used. Each browser remembers its last five submitted references in `localStorage` and lists them on `/new` with their current status.

### Following a ticket (`/t/:ref`)

The ticket page reads `GET /api/tickets/ref/:ref`, joins the ticket's socket room, and refetches on every
`ticket:update`. It shows the customer's message, a Received → Triaged → Drafted → Replied stepper, and a
typing indicator ("Reviewing your request…", then "Writing a reply…"). Category and priority appear as soon
as triage finishes, and the reply arrives as a support message that closes the conversation. `failed` and
`needs_attention` both show one neutral message with no reason; the page stays connected, so a replay by the
team brings the indicator back. Only a completed ticket disconnects.

### Public and ops ticket views

The customer routes return a **public view** of a ticket: its subject, description, status, event names and
times, phase statuses, and from the AI output only `category`, `priority` and `customerReply`. They never
return `sentiment`, `escalate`, `recommendedTeam`, `issueSummary`, `internalNote`, `nextActions` or event
`detail` (failure reasons). `src/services/ticket-views.ts` builds the public view field by field, so a new
field stays private until it is added there on purpose; `tests/api/ticket-redaction.test.ts` checks the exact
set of keys.

| Route | View |
|---|---|
| `GET /api/tickets/:id`, `GET /api/tickets/ref/:ref` | Public |
| `GET /api/tickets/:id/events` | Public (`event`, `occurredAt`) |
| `GET /api/ops/tickets/:id` | Full: every stage output and event `detail` |
| `GET /api/ops/tickets/:id/events` | Full, same paging |

The ops routes need an ops session (see [Ops sign-in](ops.md#ops-sign-in)).

### Ops console (`/ops`)

One page for staff. Signed out, it shows only the sign-in card (a token field that posts to `POST /api/ops/session`);
a `401` from any console request sends the operator back to it, and **Sign out** ends the session.

- **KPI strip**: tickets in the last 24 hours, AI success rate, average latency and fallback rate, from `GET /api/ops/ai-interactions/summary`.
- **Ticket table**: All / Needs attention / Failed / Completed tabs with counts, sorting by updated or created time, and
  20 rows a page, from `GET /api/tickets`. The tab, sort, page and open ticket live in the URL, so a reload keeps your place.
- **Live updates**: the console joins the ops room and re-reads the list, counts, KPIs and any open drawer when it hears
  `ops:ticket_event`, `ticket:requeued`, `ticket:failed` or `ticket:needs_attention`, so rows change with no reload.
  The header shows whether the feed is connected. `ticket:needs_attention` and `ticket:failed` also raise a toast with an **Open** action.
- **Detail drawer** (click a row): the full triage (category, priority, sentiment, escalate, team, summary), the customer's
  message, the drafted reply, internal note and next actions, the event timeline (paged with **Load more**), and every AI
  call for the ticket (step, model, latency, whether the backup provider answered, outcome).
- **Replay**: offered for `failed` and `needs_attention` tickets, and asks once because a replay spends AI calls. It resumes at
  the stage that did not finish. A `409` (something already moved the ticket) and a `503` (it could not be requeued and was left as it was) show as plain toasts.

`web/src/pages/ops.test.tsx` and `web/src/components/ops/ticket-drawer.test.tsx` cover the console; `e2e/ops-console.spec.ts`
signs in, filters to a `needs_attention` ticket made with `[fake:invalid-draft]`, replays it and watches the row complete.


## Testing without an AI provider

`LLM_MODE=fake` returns canned triage and draft output at the provider boundary, so tickets complete without Portkey or any API key. Everything above that layer still runs for real (retries, validation, `ai_interactions` rows with model `fake`, events, notifications).

| Setting | Effect |
|---|---|
| `LLM_FAKE_DELAY_MS` | Delay per fake call (default `1500`, so the typing indicators are visible). Tests use `0`. |
| `[fake:invalid-triage]` in a description | Triage returns blank fields, so the ticket goes to `needs_attention` |
| `[fake:invalid-draft]` in a description | Draft returns a blank reply, so the ticket goes to `needs_attention` |

The API and the worker both refuse to start with `LLM_MODE=fake` when `NODE_ENV=production`, and with any `LLM_MODE` other than `real` or `fake`.

```bash
bun run test:web    # web unit tests (Vitest + Testing Library + MSW)
bun run test:e2e    # Playwright against the built app; needs `docker compose up -d`, `bun run migrate`, `bun run setup`
```

`test:e2e` builds the web app and starts `e2e/stack.ts`: the API and the worker in one process with
`LLM_MODE=fake`, so submitted tickets really get processed. Stop any dev worker before running it, because it
reads the same queue and, in real mode, would spend LLM calls on e2e tickets.

