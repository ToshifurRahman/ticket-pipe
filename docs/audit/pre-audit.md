# Epic 7 pre-audit (7.0.9)

Audit date: 2026-10-29, against `main` after 7.0.8. It reads the 12 Epic 7 stories that still need work (5.6 and 7.1 to 7.13, minus 7.6 and 7.12) against the current code. It makes no code changes. When a 7.x story starts, its plan reads its section here first.

Probes run (all read-only, from the repo root):

| Command                                     | Result                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| `bun --filter @ticket-pipe/web build`       | Passes in 5 s. Main chunk 359.5 kB.                                               |
| `docker build --network host -t pa-probe .` | Passes in 24 s. Image 449 MB, `User=bun`, `Healthcheck=null`, no tests or `.env`. |
| `bun run lint`                              | Passes with zero warnings.                                                        |
| `bun run typecheck`                         | Passes (API, web, root).                                                          |
| `git ls-files .env`                         | Empty: `.env` is untracked and ignored (`.gitignore:17`).                         |

`bun run test` was not run: it needs the compose stack and belongs to 7.7.

## Severity rubric

Same scale as 7.12. Critical and High findings block go-live.

| Severity | Meaning                                                       |
| -------- | ------------------------------------------------------------- |
| Critical | Data or secret exposure, or the app cannot run in production. |
| High     | A security or abuse gap, or a story that fails as written.    |
| Medium   | A wrong path or assumption that costs rework.                 |
| Low      | Doc or naming drift.                                          |

Finding IDs are `PA-<story>-NN`. Columns: ID · Severity · Location · Evidence · Fix or accepted-risk reason · Status. Each finding has one owning story; other stories link to it.

## Summary

No Critical findings. Seven High findings: two on how the app runs in production (7.1), two on what ships in the image and the CSP (7.2, 7.4), and three on stories that fail as written (7.8, 7.9, 7.13).

| Story | Critical | High | Medium | Low |
| ----- | -------- | ---- | ------ | --- |
| 5.6   | 0        | 0    | 0      | 1   |
| 7.1   | 0        | 2    | 2      | 1   |
| 7.2   | 0        | 1    | 2      | 1   |
| 7.3   | 0        | 0    | 4      | 1   |
| 7.4   | 0        | 1    | 4      | 2   |
| 7.5   | 0        | 0    | 4      | 0   |
| 7.7   | 0        | 0    | 4      | 1   |
| 7.8   | 0        | 1    | 4      | 1   |
| 7.9   | 0        | 1    | 2      | 1   |
| 7.10  | 0        | 0    | 2      | 1   |
| 7.11  | 0        | 0    | 2      | 2   |
| 7.13  | 0        | 1    | 2      | 1   |
| Total | 0        | 7    | 32     | 13  |

### Critical and High findings

- [PA-7.1-01](#71-production-build): the story's `tsc` to `dist/` build does not fit a Bun runtime that runs TypeScript directly.
- [PA-7.1-02](#71-production-build): there is no `main.ts`, and the production image starts the API only, so no ticket is ever processed.
- [PA-7.2-01](#72-container-image): the Dockerfile passes no `VITE_*` build variables, so the Turnstile key, analytics token and site URL never reach the build.
- [PA-7.4-01](#74-hardened-http-layer): the CSP as written would block Turnstile's iframe and so block ticket submission.
- [PA-7.8-01](#78-production-infrastructure): `setup-infra.ts` refuses to run without `SQS_ENDPOINT`, so it cannot create the real AWS queues.
- [PA-7.9-01](#79-continuous-deployment): migrations before start have no home on Render's free plan.
- [PA-7.13-01](#713-go-live--portfolio-readme): the live smoke test cannot submit a ticket once Turnstile is enforced and fake LLM is refused in production.

### Cross-story map

| Dependency                                                                   | Why                                                                                      |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 7.1 before 7.2                                                               | The image `CMD` must run the combined entry point (PA-7.1-02).                           |
| 7.3 before 7.5 and 7.8                                                       | New variables (`TURNSTILE_SECRET_KEY`, real AWS keys) belong in the validated schema.    |
| 7.10 before 7.9                                                              | Render's health check and the image `HEALTHCHECK` want `/health/ready` (PA-7.9-02).      |
| 7.7 before 7.9                                                               | Render must deploy only after CI is green (PA-7.9-03).                                   |
| 7.2 build args before 7.4, 7.5, 7.9                                          | CSP, Turnstile and analytics checks need a production-style build.                       |
| 7.11 before the Render service is created in 7.8/7.9, or accept a URL change | `PUBLIC_SITE_URL`, `VITE_SITE_URL` and the Turnstile hostname depend on it (PA-7.11-03). |
| 5.6 closes; its one leftover moves to 7.13                                   | The production 401 check (PA-7.13-02).                                                   |

Suggested order, changing nothing in ClickUp: 7.1, 7.3, 7.10, 7.2, 7.4, 7.5, 7.7, 7.11, 7.8, 7.9, then 7.12 and 7.13.

## 5.6 Protected Ops Endpoints

ClickUp `86exbze8r`, status `prestage`. Residual-scope check against 6.5.

### Already exists

- `requireOpsSession` (`apps/api/src/middleware/ops-auth.ts`) returns 401 `{ error: 'Unauthorized' }` without a valid session cookie.
- `apps/api/src/routes/ops.ts` applies it to every `/api/ops/*` route, including `/ai-interactions` (raw `error_message`).
- `apps/api/src/routes/tickets.ts` applies it to `GET /api/tickets` (list) and `POST /api/tickets/:id/replay`. All other ticket routes stay public.
- `ops:subscribe` in `apps/api/src/lib/socket.ts` looks up the session from the handshake cookie and replies `{ ok: false, error: 'unauthorized' }` otherwise. The `TODO(7.6)` is gone.
- Public event `detail` is dropped: `toPublicEvent` returns only `event` and `occurredAt` (`apps/api/src/services/ticket-views.ts:126`).
- Tests: `apps/api/tests/api/ops/auth.test.ts`, `session.test.ts`, and `apps/api/tests/integration/server.test.ts` (socket).

### Missing

- A production check that the protected routes return 401 without a session. Nothing in the repo does it against a deployed URL. Moved to 7.13 (PA-7.13-02).

### Stale assumptions

- "A shared ops token, sent in a request header": it is now a session cookie (6.5). The token is only posted to `POST /api/ops/session`.
- `src/lib/socket.ts` is `apps/api/src/lib/socket.ts`.
- "Recovery actions" has no separate route: replay is the only one.
- Public-response redaction moved to 6.3 and is done.

### Scope changes

- − Header-token auth, the socket TODO and event `detail` redaction: all done by 6.5 and 6.3.
- Verdict: **close 5.6.** The one leftover, the production 401 check, goes to 7.13.

### Current paths

`apps/api/src/middleware/ops-auth.ts`, `apps/api/src/routes/{ops,tickets,ops-session}.ts`, `apps/api/src/lib/{socket,ops-session}.ts`, `apps/api/src/services/ticket-views.ts`.

### Findings

| ID        | Severity | Location                        | Evidence                                                                | Fix or accepted-risk reason                       | Status |
| --------- | -------- | ------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------- | ------ |
| PA-5.6-01 | Low      | ClickUp 5.6 (status `prestage`) | The description says "Merged into UI — 6.5", yet the task is still open | Close 5.6; the production 401 check is PA-7.13-02 | Open   |

## 7.1 Production Build

ClickUp `z8py7adu77`, `backlog`. Comment on the task: paths change to `apps/*` after 7.0.1.

### Already exists

- `bun --filter @ticket-pipe/web build` runs `tsc -b && vite build` into `apps/web/dist` (probe: passes).
- The API serves `apps/web/dist` through `apps/api/src/middleware/web-app.ts`, with precompressed files.
- `apps/api/src/index.ts` starts Hono through `server.ts` and has SIGTERM/SIGINT shutdown for the server and socket.io/Redis.
- `apps/api/src/worker.ts` is a separate entry point with its own SIGTERM/SIGINT handlers (`import.meta.main` block, line 496).
- Logging is already plain JSON in production: pino-pretty is used only when `NODE_ENV !== 'production'` (`apps/api/src/lib/logger.ts:5`).

### Missing

- `src/main.ts` (API and worker in one process).
- Scripts `build`, `start`, `start:api`, `start:worker`. `apps/api/package.json` has only `dev`, `worker`, `setup`, `migrate`, `purge`, `test*`; the root has no `build` or `start`.
- A way to stop `run()` from outside: its loop is `while (true)` with no abort signal (`apps/api/src/worker.ts:435`).

### Stale assumptions

- Express: the app is Hono on `Bun.serve`.
- `npm run build`, `npm start`: the repo uses Bun and workspaces (`bun --filter @ticket-pipe/<app> <script>`).
- `tsc` into `dist/`: the runtime is Bun running `.ts` directly (`CMD ["bun", "src/index.ts"]`). `apps/api/tsconfig.json` emits next to sources unless `--noEmit`, so a `tsc` build step would need its own config and a runtime change.
- `src/`, `web/`: now `apps/api/src`, `apps/web`.

### Scope changes

- − `tsc` to `dist/` build and the compiled-JS start, unless a decision says otherwise (PA-7.1-01).
- - `apps/api/src/main.ts` running server and worker, with one shutdown path.
- - Root `build` and `start` scripts that delegate with `--filter`.
- Logging acceptance criterion is already met; keep a test that pins it.

### Current paths

`apps/api/src/{index,server,worker,app}.ts`, `apps/api/src/middleware/web-app.ts`, `apps/api/src/lib/logger.ts`, `apps/api/package.json`, root `package.json`, `Dockerfile`.

### Decisions (7.1 plan, 2026-11-06)

- Bun runs the TypeScript directly; there is no API `dist/` (PA-7.1-01). Corrected acceptance: `bun run build` type-checks the API and builds `apps/web/dist`; `bun run start` runs API and worker together; `start:api` and `start:worker` run each alone; with `NODE_ENV=production` logs are JSON and `pino-pretty` is not installed; SIGTERM/SIGINT stops HTTP, drains the worker, then closes Redis and Postgres within 25 s.
- The image `CMD` moved from 7.2 to 7.1 and now runs `src/main.ts` (PA-7.1-02).
- `NODE_ENV` comes from the environment, not the start scripts. The Dockerfile sets it.

### Findings

| ID        | Severity | Location                                               | Evidence                                                                                                                 | Fix or accepted-risk reason                                                                                                       | Status |
| --------- | -------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------ |
| PA-7.1-01 | High     | Story text; `Dockerfile:25`; `apps/api/tsconfig.json`  | Description requires `tsc` into `dist/`. The image already runs `bun src/index.ts`, and `tsc -p apps/api` emits in place | Decide before 7.1 starts: run TypeScript with Bun (recommended; drop `dist/`) or add a bundling step. Rewrite the acceptance text | Fixed  |
| PA-7.1-02 | High     | `Dockerfile:25`; `apps/api/src/index.ts`; no `main.ts` | `CMD` starts only `src/index.ts`. Tickets are enqueued to SQS and nothing in the container consumes them                 | Add `main.ts` starting the server and `run()`. Point `CMD` at it in 7.2                                                           | Fixed  |
| PA-7.1-03 | Medium   | `apps/api/src/worker.ts:435`, `index.ts:15`            | `run()` loops forever with no stop signal, and each entry point installs its own signal handlers                         | Give `run()` an `AbortSignal`; `main.ts` owns one shutdown: stop polling, drain in-flight, close server and Redis                 | Fixed  |
| PA-7.1-04 | Medium   | `apps/api/package.json`, root `package.json`           | No `build`, `start`, `start:api` or `start:worker` scripts; the story names `npm run`                                    | Add them with `bun --filter`. Keep `start:api` and `start:worker` for a later split                                               | Fixed  |
| PA-7.1-05 | Low      | Story text                                             | "Express serves" and `web/dist` (now Hono and `apps/web/dist`)                                                           | Update the wording when the plan is written                                                                                       | Fixed  |

## 7.2 Container Image

ClickUp `z8py7adu78`, `backlog`. Comment on the task: the Dockerfile is already updated for `apps/*`.

### Already exists

- A multi-stage `Dockerfile`: a web build stage, then a runtime stage with `bun install --production --filter @ticket-pipe/api`.
- Non-root user (`USER bun`; probe: `User=bun`).
- `.dockerignore` excludes `.env`, `.git`, `e2e`, `apps/api/tests`, `node_modules` and `apps/web/dist`.
- The runtime image holds only `migrations`, `node_modules`, `package.json`, `scripts` and `src` under `/app/apps/api` (probe: listed). No tests and no `.env`.
- The same image runs the worker: `docker run <image> bun src/worker.ts` (README line 104).

### Missing

- A `HEALTHCHECK` (probe: `Healthcheck=null`).
- `ARG`/`ENV` for the `VITE_*` build variables.
- A compose service or documented command to run the image against the compose stack.

### Stale assumptions

- `node:20-slim`: the base is `oven/bun:1.3`.
- "Ships only compiled output": it ships the `.ts` sources (see PA-7.1-01).
- `docker build` needs `--network host` on this machine; that is a local trap, not a CI requirement.

### Scope changes

- Rewrite the base-image wording; keep "non-root", "no `.env`/tests/dev deps" as checks that already pass.
- - `VITE_*` build args (PA-7.2-01).
- - `HEALTHCHECK` using Bun, since the Bun image has no curl (PA-7.2-03).

### Current paths

`Dockerfile`, `.dockerignore`, `docker-compose.yml`, `apps/api/package.json`.

### Decisions (7.2 plan, 2026-11-06)

- Corrected acceptance: the image is built from one recipe everywhere (pinned `oven/bun:1.3.14`, frozen lockfile, non-root `bun`, Bun runs the TypeScript sources), not as identical bytes: the three public `VITE_*` args are baked into the web bundle. `docker build` fails when `VITE_TURNSTILE_SITE_KEY` is empty; the analytics token and site URL stay optional. No `.env`, tests or dev dependencies are in the image. The `HEALTHCHECK` calls `/health` with `bun -e` and follows `$PORT` (7.10 moves it to `/health/live`). `bun run test:image` runs the image against the compose stack (profile `image`: own database, queues and Redis) until a ticket reaches `triage.started`, with no LLM call.
- The Cloudflare test key still builds on purpose (local and CI). 7.12 checks that production does not use it.

### Findings

| ID        | Severity | Location                                                    | Evidence                                                                                                                         | Fix or accepted-risk reason                                                                                                                      | Status |
| --------- | -------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| PA-7.2-01 | High     | `Dockerfile:1-9`; `apps/web/src/components/turnstile.tsx:8` | The web stage has no `ARG`, so Vite never sees `VITE_TURNSTILE_SITE_KEY`, `VITE_CF_ANALYTICS_TOKEN` or `VITE_SITE_URL` on Render | Declare the args and set them on Render. Fail the production build when `VITE_TURNSTILE_SITE_KEY` is unset (today it silently uses the test key) | Fixed  |
| PA-7.2-02 | Medium   | `Dockerfile:1,10`; story text                               | Story says `node:20-slim`; both stages use `oven/bun:1.3`                                                                        | Rewrite the criterion for the Bun base and pin it                                                                                                | Fixed  |
| PA-7.2-03 | Medium   | `Dockerfile`; probe `Healthcheck=null`                      | No `HEALTHCHECK`; the Bun image ships no curl                                                                                    | `HEALTHCHECK CMD bun -e "fetch(...)"` against `/health/live` once 7.10 lands (`/health` until then)                                              | Fixed  |
| PA-7.2-04 | Low      | `docker-compose.yml`                                        | Compose runs LocalStack, Redis, Mailpit, Postgres and a `setup` job, but no app service                                          | Document `docker run --network host --env-file .env <image>` in the plan, or add a profile                                                       | Fixed  |

## 7.3 Validated Configuration

ClickUp `z8py7adu79`, `backlog`. No comments.

### Already exists

- Zod 4 on the API (7.0.2).
- Partial startup checks: `assertLlmModeAllowed` (`lib/llm-client.ts:74`), `assertMailConfigured` (`lib/mailer.ts:116`), `assertOpsTokenConfigured` (`lib/ops-session.ts:60`), all called from `index.ts`.
- `.env.example` with comments for most variables.

### Missing

- One schema and one validated config object.
- `TURNSTILE_SECRET_KEY` (7.5) and the real-AWS variants of the queue settings.

### Stale assumptions

- The story names `db.ts`, `queue.ts`, `socket.ts`, `worker.ts`. The reads are in 14 modules: `lib/{db,queue,socket,counters,ops-session,llm-client,mailer,sns}.ts`, `services/{customer-notifications,ops-alerts}.ts`, `worker.ts`, `index.ts`, plus `apps/api/scripts/{migrate,setup-infra}.ts` and the e2e helpers (grep of `process.env`).
- Paths are under `apps/api/src`.

### Scope changes

- - Fold the three existing `assert*` checks into the schema; their tests pin the messages (`tests/api/ops/session.test.ts:126`), so keep those messages.
- - Decide whether scripts and e2e helpers use the schema (recommended for scripts, not for e2e).
- - Web `VITE_*` variables are not read by the API; list them in `.env.example` under a separate heading.

### Current paths

`apps/api/src/lib/*.ts`, `apps/api/src/services/{customer-notifications,ops-alerts}.ts`, `apps/api/src/{index,worker}.ts`, `apps/api/scripts/*.ts`, `.env.example`.

### Findings

| ID        | Severity | Location                                                         | Evidence                                                                                                                                                                         | Fix or accepted-risk reason                                                                                | Status                                                                                 |
| --------- | -------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| PA-7.3-01 | Medium   | `lib/db.ts:5`, `lib/queue.ts:106`, `lib/socket.ts:14`            | These throw at import time, before any schema could run, and 14 modules read `process.env`                                                                                       | Load and validate config first (top of `index.ts`/`main.ts`); modules import the object, not `process.env` | Done: `lib/config.ts` validates once; `db`, `queue`, `socket` build lazily.            |
| PA-7.3-02 | Medium   | `lib/queue.ts:113`, `lib/sns.ts:32`, `scripts/setup-infra.ts:19` | AWS keys default to `'test'`. In production a missing key becomes an opaque SQS 403 instead of a startup failure                                                                 | Require real keys unless `SQS_ENDPOINT` is set; keep the `test` defaults for local only                    | Done: `lib/config.ts` requires the AWS keys unless `SQS_ENDPOINT` is set.              |
| PA-7.3-03 | Medium   | `index.ts:33-35`; `tests/api/ops/session.test.ts:126`            | Three assert functions already run at startup, and tests pin their messages                                                                                                      | Move the rules into the schema without changing messages; keep the tests                                   | Done: the rules live in `lib/config.ts`; the asserts delegate and keep their messages. |
| PA-7.3-04 | Medium   | `.env.example`                                                   | Missing: `BREVO_API_KEY`, `MAIL_DAILY_CAP`, `NODE_ENV`, `TURNSTILE_SECRET_KEY`, `VITE_TURNSTILE_SITE_KEY`, `VITE_CF_ANALYTICS_TOKEN`, `VITE_SITE_URL`; `LLM_MODE` only commented | Generate the list from the schema; add a guard test that every schema key appears in `.env.example`        | Done: `.env.example` lists every key; `tests/guards/env-example.test.ts`.              |
| PA-7.3-05 | Low      | `.env.example` (`MAIL_FROM=support@relay.com`)                   | The sample sender is on a real third-party domain; Brevo needs a verified sender                                                                                                 | Use a placeholder; see Parked list                                                                         | Done: `MAIL_FROM=noreply@example.com` in `.env.example`.                               |

## 7.4 Hardened HTTP Layer

ClickUp `z8py7adu7a`, `backlog`. Comment from 6.7: the CSP must allow the analytics beacon (`script-src` `static.cloudflareinsights.com`, `connect-src` `cloudflareinsights.com`).

### Already exists

- Body limit: `bodyLimit` 100 KB on `/api/*` returns 413 (`apps/api/src/app.ts:21-27`).
- Field maximums: `SUBJECT_MAX` and `DESCRIPTION_MAX` in the create schema (`controllers/tickets.ts:34,42`), mirrored in the web form.
- Client IP behind a proxy: `clientIp()` takes the last `X-Forwarded-For` hop (`middleware/client-ip.ts`).
- Ops cookie: `httpOnly`, `secure`, `SameSite=Strict` (`routes/ops-session.ts:43-45`).
- Fonts are self-hosted through `@fontsource` (`apps/web/src/app/main.tsx:3-5`).

### Missing

- Security headers and a CSP. There is no `secure-headers` or `cors` use in `apps/api/src`.
- CORS policy for HTTP (same-origin by default, so possibly nothing to add).
- A test that pins the headers.

### Stale assumptions

- `helmet`, `trust proxy`: these are Express. Hono has `hono/secure-headers` and `hono/cors`, and there is no `trust proxy` setting.
- "Inter font": the UI uses Public Sans, Courier Prime and Archivo Narrow, self-hosted, so `font-src 'self'`.
- "Maximum lengths … verify here": already done in 6.2; verify only.
- `web/src/components/analytics.tsx` is `apps/web/src/app/analytics.tsx`.
- The CSP list names only Turnstile's script host. The widget renders in an iframe and needs `frame-src https://challenges.cloudflare.com`.

### Scope changes

- − Install `helmet`; use `hono/secure-headers`.
- − Build a body limit and field limits (done).
- - Decide the Socket.IO origin policy (PA-7.4-03).
- - Test the CSP in a production-style build with Turnstile and analytics enabled.

### Current paths

`apps/api/src/app.ts`, `apps/api/src/middleware/{web-app,client-ip}.ts`, `apps/api/src/lib/socket.ts`, `apps/web/src/components/turnstile.tsx`, `apps/web/src/app/analytics.tsx`, `apps/web/src/app/main.tsx`.

### Findings

| ID        | Severity | Location                                         | Evidence                                                                                                                                                                | Fix or accepted-risk reason                                                                                              | Status |
| --------- | -------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------ |
| PA-7.4-01 | High     | Story text; `turnstile.tsx:3`; `analytics.tsx:3` | CSP allow-list omits `frame-src` for `challenges.cloudflare.com`; sockets need `connect-src` `'self'` and `wss:`; React inline `style` attributes need `style-src-attr` | Write the CSP from a real browser run with Turnstile and analytics on; add a test; check `/ops` and the landing demo too | Open   |
| PA-7.4-02 | Medium   | Story text                                       | `helmet` and `trust proxy` do not exist in Hono                                                                                                                         | Use `hono/secure-headers`; `clientIp()` already covers the proxy                                                         | Open   |
| PA-7.4-03 | Medium   | `apps/api/src/lib/socket.ts:58,61`               | `cors: { origin: '*' }` on both the Server and the BunEngine. The ops cookie is `SameSite=Strict`, so the exposure is limited to public data                            | Limit to the site origin (`PUBLIC_SITE_URL`), keeping localhost for dev                                                  | Open   |
| PA-7.4-04 | Medium   | Story text; `apps/web/src/app/main.tsx:3-5`      | Story mentions the Inter font; the fonts are self-hosted from `/assets`                                                                                                 | `font-src 'self'`; drop the font hosts from the plan                                                                     | Open   |
| PA-7.4-05 | Medium   | `apps/api/src/app.ts:21-27`                      | The limit covers `/api/*` only and is already tested for tickets                                                                                                        | Verify with a test per public POST route; no new code expected                                                           | Open   |
| PA-7.4-06 | Low      | Comment from 6.7; `analytics.tsx` header         | Path is `apps/web/src/app/analytics.tsx`; the token needs the build arg from PA-7.2-01                                                                                  | Update the comment path when the plan is written                                                                         | Open   |
| PA-7.4-07 | Low      | `middleware/client-ip.ts`                        | Returns `'local'` when no header is present; correct behind Render's proxy, wrong for a direct connection                                                               | Verify on the deployed service in 7.12.1                                                                                 | Open   |

## 7.5 Abuse Protection

ClickUp `z8py7adu7b`, `backlog`. No comments.

### Already exists

- Client Turnstile widget with the always-pass test key as a fallback (`apps/web/src/components/turnstile.tsx`), and the create call already sends `turnstileToken` (`apps/web/src/features/tickets/api.ts:15`, comment: the API ignores it until 7.5).
- Redis fixed-window counters (`apps/api/src/lib/counters.ts`) used by the notification opt-in rate limit and the daily mail cap (6.9).
- `clientIp()` for per-IP keys.

### Missing

- Server-side Turnstile verification for ticket creation.
- A per-IP limit and a daily cap on `POST /api/tickets`.
- Friendly 403 and 429 responses and the matching web handling.

### Stale assumptions

- "Build the rate limit": the counters exist; reuse them.
- Paths are under `apps/api/src`.
- Tests use "Cloudflare's test keys"; the web fallback already does, but the API has no verifier or key variable yet.

### Scope changes

- - Reuse `counters.ts`; add `TURNSTILE_SECRET_KEY` to the 7.3 schema.
- - Decide whether the notification opt-in (`POST /api/tickets/:id/notification`, which sends email) is covered (PA-7.5-02).

### Current paths

`apps/api/src/controllers/{tickets,notifications}.ts`, `apps/api/src/lib/counters.ts`, `apps/api/src/middleware/client-ip.ts`, `apps/web/src/components/turnstile.tsx`, `apps/web/src/features/tickets/{api.ts,components/ticket-form.tsx}`.

### Findings

| ID        | Severity | Location                                       | Evidence                                                                                                                      | Fix or accepted-risk reason                                                                                          | Status |
| --------- | -------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------ |
| PA-7.5-01 | Medium   | `apps/api/src/lib/counters.ts`                 | Fixed-window Redis counters already exist and are tested (6.9)                                                                | Reuse them for the per-IP limit and the daily cap. Pick one UTC day boundary                                         | Open   |
| PA-7.5-02 | Medium   | `apps/api/src/controllers/notifications.ts:19` | The public opt-in route already accepts an optional `turnstileToken` and sends email; the criteria cover only ticket creation | Decide: verify the token there too (recommended) or accept the per-IP limit alone                                    | Open   |
| PA-7.5-03 | Medium   | Story text; `apps/api/src/worker.ts`           | One ticket costs 2 stages × up to 3 attempts × a possible backup call, so counting tickets is not counting LLM calls          | Count at submit and document the worst case per ticket; "no LLM calls once capped" holds because nothing is enqueued | Open   |
| PA-7.5-04 | Medium   | `apps/api/src/middleware/client-ip.ts`         | Without `X-Forwarded-For` every caller shares the key `'local'`; a proxy misconfiguration would 429 everyone                  | Add a startup/readiness note in 7.9; test the limit with and without the header                                      | Open   |

## 7.7 Continuous Integration

ClickUp `z8py7adu7c`, `backlog`. Comment: run `bun run check` from CI and add commitlint from 7.0.8.

### Already exists

- `bun run check` = `format:check`, `lint`, `typecheck`, `test` (root `package.json`). Lint and typecheck pass locally (probes).
- commitlint config (`commitlint.config.js`) and the husky hook.
- `docker-compose.yml` with Postgres, Redis, LocalStack, Mailpit and a `setup` job.

### Missing

- Any workflow. `.github/` holds only `pull_request_template.md`.
- The README CI badge.

### Stale assumptions

- Separate "backend" and "`web/`" lint/typecheck jobs: one root `check` covers both.
- Service containers are Postgres, Redis, LocalStack; the tests also need Mailpit, and the migrate and `setup` steps.
- Root `bun run build` does not exist yet (PA-7.1-04); the web build is `bun --filter @ticket-pipe/web build`.

### Scope changes

- - Mailpit service, `bun --filter @ticket-pipe/api migrate` and `setup` steps.
- - commitlint over the PR range.
- - Decide about e2e, accessibility and Lighthouse (PA-7.7-03).
- `docker build --network host` is a local trap; CI should use a plain `docker build`.

### Current paths

`package.json`, `docker-compose.yml`, `commitlint.config.js`, `playwright.config.ts`, `.github/`.

### Findings

| ID        | Severity | Location                                    | Evidence                                                                                                | Fix or accepted-risk reason                                                                                    | Status |
| --------- | -------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| PA-7.7-01 | Medium   | Story text; `docker-compose.yml`            | Story lists three services; the suite also needs Mailpit and the migrate and setup steps                | Mirror the compose services in the workflow and run both steps before tests                                    | Open   |
| PA-7.7-02 | Medium   | Story text; root `package.json`             | `check` already covers format, lint, typecheck and test; the story's split jobs are stale               | One job runs `bun run check`; add the web build, `docker build` and commitlint. Pin Bun 1.3 and Node ≥ 24.22.1 | Open   |
| PA-7.7-03 | Medium   | `playwright.config.ts`, `e2e/stack.ts`      | e2e needs `LLM_MODE=fake` and the compose stack; the story does not mention it                          | Decide: run e2e on PRs, nightly, or not in CI; record the choice                                               | Open   |
| PA-7.7-04 | Medium   | Notes from 7.0.4 and 7.0.8 (project memory) | The `ai-interactions` summarize test is flaky under full parallel load; the format guard timed out once | Allow a retry, or run that file serially, before CI blocks merges                                              | Open   |
| PA-7.7-05 | Low      | `README.md`                                 | No CI badge                                                                                             | Add it once the workflow exists                                                                                | Open   |

## 7.8 Production Infrastructure

ClickUp `z8py7adu7d`, `backlog`. No comments.

### Already exists

- The queue client works against any endpoint: `SQS_ENDPOINT` is optional, so an unset value targets real AWS (`apps/api/src/lib/queue.ts:110`).
- The runtime SQS calls are `SendMessage`, `ReceiveMessage`, `DeleteMessage` and `GetQueueUrl` (`lib/queue.ts`), matching the story's IAM list.
- `setup-infra.ts` creates the main queue, the DLQ and (with `SNS_ENDPOINT`) the alert topic. It is idempotent.
- `pg` takes SSL settings from the connection string; Redis accepts `rediss://`.

### Missing

- A way to create the real AWS queues (PA-7.8-01).
- IAM, budget and calendar steps: manual, recorded nowhere.
- An ElasticMQ service for the local check (compose has LocalStack only).

### Stale assumptions

- `scripts/setup-infra.ts`: it is `apps/api/scripts/setup-infra.ts`, run by `bun --filter @ticket-pipe/api setup`.
- The IAM list omits SNS publish, which the ops alerts use (`lib/sns.ts`).

### Scope changes

- - A real-AWS path in `setup-infra.ts` (no endpoint required, real credentials, an admin identity).
- - `sns:Publish` on the alert topic, or an explicit decision to run without alerts.
- - An ElasticMQ host decision (PA-7.8-03).

### Current paths

`apps/api/scripts/{setup-infra,migrate}.ts`, `apps/api/src/lib/{queue,sns,db,socket,counters,ops-session}.ts`, `docker-compose.yml`, `.env.example`.

### Findings

| ID        | Severity | Location                                                   | Evidence                                                                                                                                                                                            | Fix or accepted-risk reason                                                                                    | Status |
| --------- | -------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| PA-7.8-01 | High     | `apps/api/scripts/setup-infra.ts:10`                       | `if (!process.env.SQS_ENDPOINT) throw …`: the script that the story says creates the AWS queues refuses to run against AWS                                                                          | Make the endpoint optional; require real keys when it is unset; document who runs it                           | Open   |
| PA-7.8-02 | Medium   | Story text; `apps/api/src/lib/sns.ts`; `setup-infra.ts:62` | Runtime IAM matches the code for SQS only. Queue creation needs create/attribute permissions (admin, once). SNS alerts need `sns:Publish`, and the topic is only created when `SNS_ENDPOINT` is set | Two identities: admin for setup, runtime user for the app; add the topic ARN to the policy or drop alerts      | Open   |
| PA-7.8-03 | Medium   | Story text; `docker-compose.yml`                           | ElasticMQ needs a host. Render free has one web service that sleeps; AWS free access ends 2027-04-03, 156 days from this audit                                                                      | Name the host (or move to ElasticMQ at go-live); add an ElasticMQ compose profile to verify the switch locally | Open   |
| PA-7.8-04 | Medium   | `lib/counters.ts`, `lib/ops-session.ts`, `lib/socket.ts`   | At least four Redis clients (counters, ops sessions, socket pub and sub) plus the Socket.IO adapter, against Upstash's free command quota                                                           | Measure commands per ticket and per idle hour on the local stack; record the budget in 7.12.4                  | Open   |
| PA-7.8-05 | Medium   | `apps/api/scripts/migrate.ts:12`; `lib/db.ts:9`            | Migrations use a plain `pg` client on `DATABASE_URL`; Neon's pooled endpoint is not suitable for DDL                                                                                                | Use Neon's direct URL for migrations (a second variable or a note); the app can use the pooled one             | Open   |
| PA-7.8-06 | Low      | Acceptance criteria                                        | The calendar reminder and budget alert are manual                                                                                                                                                   | Put them in the 7.8 checklist and the runbook (7.12.7)                                                         | Open   |

## 7.9 Continuous Deployment

ClickUp `z8py7adu7e`, `backlog`. No comments.

### Already exists

- The `Dockerfile` builds web and API, and the image contains `apps/api/scripts/migrate.ts` and `apps/api/migrations/`.
- `/health` checks the database.
- `.env` is untracked and ignored (probe: `git ls-files .env` empty).

### Missing

- A Render blueprint or documented service settings (no `render.yaml`).
- A migration step wired into the deploy.
- The list of environment variables to set on Render.

### Stale assumptions

- "Migrations run before the new version starts": a Render pre-deploy command is, as far as this audit can tell, not offered on free instances. Verify in Render's docs before planning.
- Render health check on `/health`: 7.10 changes it to `/health/ready`.

### Scope changes

- - Run `migrate.ts` before the server in the container start command, if a pre-deploy command is unavailable.
- - Gate auto-deploy on CI (7.7).
- - The Render environment list, generated from the 7.3 schema and the `VITE_*` build args.

### Current paths

`Dockerfile`, `apps/api/scripts/migrate.ts`, `apps/api/migrations/`, `apps/api/src/routes/health.ts`, `.env.example`.

### Findings

| ID        | Severity | Location                          | Evidence                                                                                   | Fix or accepted-risk reason                                                                                                        | Status |
| --------- | -------- | --------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------ |
| PA-7.9-01 | High     | `Dockerfile:25`; no `render.yaml` | `CMD` starts the server only. A pre-deploy hook is probably paid-only on Render            | Start with `bun scripts/migrate.ts && bun src/main.ts`, or script the migration into `main.ts`. Verify against Render's docs first | Open   |
| PA-7.9-02 | Medium   | `apps/api/src/routes/health.ts`   | `/health` queries Postgres, so a suspended Neon database can fail or slow the deploy check | Land 7.10 first, or point the check at `/health` with a generous timeout                                                           | Open   |
| PA-7.9-03 | Medium   | Story text                        | "Deploys on every push to `main`" has no CI gate                                           | Use Render's "after CI checks pass" auto-deploy option; depends on 7.7                                                             | Open   |
| PA-7.9-04 | Low      | Repo-wide                         | `git ls-files .env` is empty, but no secret scan has run over history                      | Parked for 7.12.1                                                                                                                  | Open   |

## 7.10 Uptime & Error Monitoring

ClickUp `z8py7adu7f`, `backlog`. No comments.

### Already exists

- `GET /health` runs `SELECT 1` and answers 503 `{ status: 'error' }` when the database is down (`apps/api/src/routes/health.ts`).
- Request logging treats `/health` as debug-level (`middleware/request-logger.ts:16`).
- Tests use `/health` (`tests/integration/server.test.ts:41,92`, `tests/api/ops/auth.test.ts:68`, `tests/api/web/serving.test.ts`).

### Missing

- `/health/live` and `/health/ready`.
- UptimeRobot, the public status page, the README link and Sentry (all external).

### Stale assumptions

- Nothing about the stack is stale; the health split is simply not built.
- The 744 of 750 free hours claim assumes a single Render service; the combined `main.ts` (PA-7.1-02) keeps that true.

### Scope changes

- - Decide whether `/health` stays as an alias of `/ready`.
- - Update every `/health` reference when the routes change.

### Current paths

`apps/api/src/routes/health.ts`, `apps/api/src/middleware/request-logger.ts`, `apps/api/src/app.ts`, `apps/api/tests/**` (the three files above).

### Findings

| ID         | Severity | Location                                         | Evidence                                                                                 | Fix or accepted-risk reason                                                   | Status |
| ---------- | -------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| PA-7.10-01 | Medium   | `apps/api/src/routes/health.ts`; four test files | Only `/health` exists, and tests and the logger name it                                  | Add the two routes; keep `/health` as an alias of ready until references move | Fixed  |
| PA-7.10-02 | Medium   | `middleware/request-logger.ts:16`                | Only the exact path `/health` is quiet; `/health/live` every 5 minutes would log at info | Match the `/health` prefix                                                    | Fixed  |
| PA-7.10-03 | Low      | Story text                                       | Keep-awake only helps if the worker shares the process (PA-7.1-02)                       | Note the dependency in the plan                                               | Open   |

## 7.11 Rename Repo, README & Render Service to Brand

ClickUp `z8py7ae0rd`, `backlog`. Comments: renumbered from 7.12 on 2026-10-24; brand is "Relay" (decided in 6.8); left to do: repo rename, `brand.repoUrl`, README title, Render service name, `VITE_SITE_URL`.

### Already exists

- `brand.name = 'Relay'` in `apps/web/src/config/brand.ts`, with `isWorkingName` gone.
- `index.html` metadata generated from `brand` at build time.

### Missing

- Everything in the story's description: the repo, README, Render service and `brand.repoUrl` are unchanged (`repoUrl` is `https://github.com/ToshifurRahman/ticket-pipe`).

### Stale assumptions

- `web/src/config/brand.ts` is `apps/web/src/config/brand.ts`.
- `brand.ts` comments still say "story 7.12" for the rename (lines 2 and 15).
- The README title is still "Ticket-Pipeline".

### Scope changes

- - Decide what happens to the internal `ticket-pipe` names (workspace scope `@ticket-pipe/*`, database name, compose project): 23 tracked files mention `ticket-pipe`.
- - Create the Render service under the final name, or accept a URL change.

### Current paths

`apps/web/src/config/brand.ts`, `README.md`, root and workspace `package.json` files, `docker-compose.yml`, `docs/`, `CONTRIBUTING.md`.

### Findings

| ID         | Severity | Location                                        | Evidence                                                                                                                                    | Fix or accepted-risk reason                                                                  | Status |
| ---------- | -------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| PA-7.11-01 | Low      | `apps/web/src/config/brand.ts:2,15`; story text | Old path and old story number                                                                                                               | Fix comments in the 7.11 change                                                              | Open   |
| PA-7.11-02 | Medium   | Repo-wide                                       | 23 files contain `ticket-pipe`, including the `@ticket-pipe/*` scope                                                                        | Rename the repo, README and Render only; keep workspace names as an accepted internal detail | Open   |
| PA-7.11-03 | Medium   | Story order                                     | The Render URL follows the service name. `PUBLIC_SITE_URL`, `VITE_SITE_URL`, Turnstile's hostname list and the email links all depend on it | Name the Render service correctly when it is created in 7.8/7.9, or run 7.11 earlier         | Open   |
| PA-7.11-04 | Low      | `README.md:1`                                   | Title "Ticket-Pipeline"                                                                                                                     | Change with the repo rename                                                                  | Open   |

## 7.13 Go-Live & Portfolio README

ClickUp `z8py7adu7g`, `backlog`. Comments: renumbered from 7.11 to 7.13; 7.12.12 Launch Gate records the go/no-go; README screenshots live in `docs/screenshots/`.

### Already exists

- A README with an ASCII architecture diagram, local run instructions and a features list.
- Eight screenshots and a GIF in `docs/screenshots/`: `customer-flow.gif`, `landing.png`, `mobile-ticket.png`, `new-ticket.png`, `ops-drawer.png`, `ops-list.png`, `ticket-completed.png`, `ticket-live.png`. `bun run screenshots` regenerates them.
- Public/ops split enforced by the session middleware (see 5.6).

### Missing

- The live URL and status page (they do not exist yet), the SQS endpoint options section, the cold-start note and the "no real personal data" notice.
- A live smoke test.
- The production 401 check carried over from 5.6.

### Stale assumptions

- "Reject requests without the token": ops routes reject requests without a session cookie (6.5).
- README "Deployment" is one line (`README.md:104`) and does not list the ElasticMQ option.

### Scope changes

- - The 401 check from 5.6.
- - Split the smoke test (PA-7.13-01).

### Current paths

`README.md`, `docs/screenshots/`, `docs/ops.md`, `e2e/`, `scripts/screenshots.ts`.

### Findings

| ID         | Severity | Location                                        | Evidence                                                                                                    | Fix or accepted-risk reason                                                                                          | Status |
| ---------- | -------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------ |
| PA-7.13-01 | High     | Story text; `apps/api/src/lib/llm-client.ts:74` | Once 7.5 is live, a headless smoke test cannot pass Turnstile, and `LLM_MODE=fake` is refused in production | Split it: automated checks for health and 401s, plus a manual submit-and-watch checklist, and say so in the criteria | Open   |
| PA-7.13-02 | Medium   | Story text; 5.6                                 | Criterion says "without the token"; 5.6's leftover is a production 401 check                                | Check list, replay, `/api/ops/*` and a refused `ops:subscribe` without a session on the live URL                     | Open   |
| PA-7.13-03 | Medium   | `README.md:104`                                 | The Deployment section is one line; no status link, no SQS options, no cold-start or data notice            | Write each item from the story; add after 7.9, 7.10 and 7.11 have real values                                        | Open   |
| PA-7.13-04 | Low      | Story text                                      | "Move every live story to Production" depends on the 7.12.12 gate                                           | Do it as the last step, after the gate records go                                                                    | Open   |

## Parked for Launch Audit

Not rated and not owned by a story above. Each line says where 7.12 should pick it up.

- **7.12.1 Security**: sign-in lockout is keyed by `clientIp()` (last `X-Forwarded-For` hop); confirm it holds on Render. Scan git history for secrets (PA-7.9-04). Run a dependency audit.
- **7.12.2 Data & Privacy**: whether ticket text reaches logs; whether `purge.ts` and the retention service run in production; the Brevo sender identity (PA-7.3-05), since no custom domain is planned.
- **7.12.3 Reliability**: how the web app and sockets behave when Render wakes from sleep; Neon free-tier restore options.
- **7.12.4 Free-tier Cost & Limits**: the Redis command budget (PA-7.8-04); LLM calls per ticket (PA-7.5-03).
- **7.12.7 Ops Runbook**: the manual steps from PA-7.8-06 and the ElasticMQ switch.
- **7.12.8 AI Safety**: prompt injection through ticket text; not examined here.
- **7.12.9 Legal Truthfulness**: `brand.repoUrl` and the legal pages' contact points after the rename.
