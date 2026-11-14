# Architecture

How the repo is laid out, which way imports may go, where tests live, and how files are named. The rules below are enforced by `eslint.config.js` and the guard tests, so a violation fails `bun run check`. A guard also fails when a folder is added to the places listed here without being described in this file.

## Folder map

```
apps/    Bun workspaces: api (@relay/api) and web (@relay/web)
e2e/     Playwright tests against the built app
scripts/ Lighthouse, screenshots, gate
docs/    Feature docs and this file
```

### `apps/api`

| Folder        | Holds                                                 |
| ------------- | ----------------------------------------------------- |
| `src/`        | The server and the worker                             |
| `migrations/` | Database schema, applied in order by `migrate`        |
| `scripts/`    | `migrate`, `setup-infra` (queues, topics) and `purge` |
| `tests/`      | The Vitest suite, including the privacy guard tests   |

### `apps/api/src`

| Folder          | Holds                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| `routes/`       | Hono route tables                                                                                              |
| `controllers/`  | HTTP handlers: parse, call a service, shape the response                                                       |
| `middleware/`   | Auth, rate limits and other Hono middleware                                                                    |
| `services/`     | Business logic, ops feed, alerts, notifications                                                                |
| `repositories/` | PostgreSQL access                                                                                              |
| `domain/`       | Pure rules (ticket phases, masking). No I/O, no Hono                                                           |
| `lib/`          | Infra clients and `config.ts`, the one Zod schema for the environment (the only file that reads `process.env`) |

Entry points sit next to them: `main.ts` runs the API and worker together, `index.ts` and `server.ts` start the API alone, `app.ts` builds the Hono app, `worker.ts` consumes the queue (triage, then draft, then finish), and `lifecycle.ts` holds the shared shutdown: on SIGTERM or SIGINT each entry point stops HTTP, drains in-flight tickets, then closes Redis and Postgres, all inside one 25 s deadline (Render sends SIGKILL after 30 s). A second signal, or a timeout, exits 1; the unfinished SQS message is redelivered.

### `apps/api/tests`

| Folder         | Holds                                                         |
| -------------- | ------------------------------------------------------------- |
| `unit/`        | Pure tests. No Docker                                         |
| `guards/`      | Repo-rule tests (format, layout, privacy, commits). No Docker |
| `integration/` | Tests that need the compose stack                             |
| `api/`         | HTTP tests, one folder per feature (needs the compose stack)  |
| `helpers/`     | Shared test code                                              |
| `fixtures/`    | Shared test data                                              |
| `setup/`       | Vitest setup files (globals installed and restored per test)  |

### `apps/web`

| Folder     | Holds                                                       |
| ---------- | ----------------------------------------------------------- |
| `src/`     | The React app (Vite, Tailwind, shadcn/ui), built to `dist/` |
| `public/`  | Static files served as-is                                   |
| `scripts/` | Token and brand-asset generators                            |
| `tokens/`  | Colour and scale sources for `tokens.css`                   |
| `tests/`   | Node guards on the source tree (import rules, tokens)       |

### `apps/web/src`

| Folder        | Holds                                                     |
| ------------- | --------------------------------------------------------- |
| `app/`        | Entry point, routes, analytics, layout (header, footer)   |
| `pages/`      | Thin route components. Each lazy route is its own chunk   |
| `features/`   | `tickets`, `ops`, `landing`                               |
| `components/` | Shared UI: shadcn `ui/`, paper-form primitives in `form/` |
| `hooks/`      | Shared hooks                                              |
| `lib/`        | Shared helpers: API client, socket, query client          |
| `content/`    | Legal copy                                                |
| `config/`     | Brand and site config                                     |
| `styles/`     | Generated and hand-written CSS                            |
| `test/`       | Test setup: fake socket, mock server                      |

A feature has the same shape everywhere: root files `index.ts`, `api.ts`, `types.ts` and `testing.ts`, plus `components/`, `hooks/` and `lib/`.

## Import rules

**API**

- Hono is imported only in `routes/`, `controllers/`, `middleware/`, `app.ts` and `server.ts`.
- `domain/` is pure: no Hono, no infra clients.
- Layers call downward: routes → controllers → services → repositories.

**Web**: imports go one way, `app → pages → features → shared`.

- Shared code (`components/`, `hooks/`, `lib/`, `content/`, `config/`) never imports a feature.
- Code outside a feature imports only its `index.ts` (`@/features/tickets`). Tests may also use `@/features/<name>/testing`.
- Inside a feature, imports are relative.
- Features don't import each other, except that `landing` uses the `tickets` index for its demo.

## Test layout

- API tests live under `apps/api/tests/`. A new test goes in `unit/` or `integration/` (or `api/<feature>/<action>.test.ts` for HTTP). The `unit` Vitest project points every service URL at a dead port, so a test that needs infra fails fast there. A guard rejects a `*.test.ts` outside these folders.
- Web tests sit next to the code they cover. Node-only guards live in `apps/web/tests/guards/`.
- End-to-end tests are in the root `e2e/`.
- Vitest runs on Node. Never `bun test`: `vi.mock` does not work under Bun.

## Naming

- Files and folders are kebab-case.
- Tests are `*.test.ts` or `*.test.tsx`. Playwright specs are `*.spec.ts`.
- Hooks are `use-*.ts`.
- Components are PascalCase in code, kebab-case in file names.
