# Contributing

## Setup

**Needs:** Bun 1.3+, Node 24.22.1+ (Vitest runs on Node), Docker.

```bash
bun install
cp .env.example .env
docker compose up -d --wait   # Postgres, Redis, LocalStack, Mailpit
bun --filter @relay/api migrate
bun --filter @relay/api setup
```

Run the app:

```bash
bun --filter @relay/api dev      # API on :3000
bun --filter @relay/api worker   # second terminal
bun --filter @relay/web dev      # Vite on :5173
```

For a production-style local run, `bun run build` then `bun --env-file=.env run start` (both services in one process). Use `start:api` or `start:worker` to run either alone.

`bun run test:image` builds the production image and checks it against the compose stack: it refuses a build without `VITE_TURNSTILE_SITE_KEY`, inspects the image, then runs it under the `image` compose profile (own database, queues and Redis) until a ticket reaches `triage.started`. It needs Docker only. If `docker build` needs host networking on your machine, set `IMAGE_BUILD_NETWORK=host`.

Set `LLM_MODE=fake` in `.env` to work without an AI provider. See the [README](README.md) for the full quick start and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for where things go.

## Scripts

Run these from the repo root.

| Script                              | Does                                                      |
| ----------------------------------- | --------------------------------------------------------- |
| `bun run check`                     | Format check, lint, typecheck and tests. Run before a PR  |
| `bun run build`                     | Type-check the API and build `apps/web/dist`              |
| `bun run start`                     | API and worker together (reads the process environment)   |
| `bun run start:api`                 | API only                                                  |
| `bun run start:worker`              | Worker only                                               |
| `bun run format`                    | Prettier over the whole repo                              |
| `bun run lint`                      | ESLint, zero warnings allowed                             |
| `bun run typecheck`                 | `tsc` for the API, web and root                           |
| `bun run test`                      | Every workspace's Vitest suite (integration needs Docker) |
| `bun --filter @relay/api test:unit` | API unit and guard tests only, no Docker                  |
| `bun run test:e2e`                  | Playwright against the built app                          |

Never `bun test` (Vitest must run on Node), and never `tsc -p apps/api` without `--noEmit`: its tsconfig emits `.js` next to the sources.

Stop any dev worker before `test:e2e`, since it reads the same queue. A Redis already running on the host (port 6379) shadows the compose one.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request, whatever its base, and on pushes to `main`. Five jobs: `check` (format, lint, typecheck, unit, integration and web tests against Postgres, Redis, LocalStack and Mailpit, after migrate and setup), `build` (the web production build), `docker` (the production image and its smoke test), `commitlint` (the pull request's commits) and `e2e` (Playwright with the fake LLM, including the accessibility spec).

`apps/api/tests/guards/format.test.ts` and `apps/api/tests/integration/repositories/ai-interactions.test.ts` run in their own serial step, after the parallel ones. The format guard shells out to Prettier and the ai-interactions summary is flaky under full parallel load, so each gets the machine to itself. The parallel steps exclude them, and `scripts/ci-test-list.ts` fails if the lists disagree or a file disappears.

## Branches

Branch off `main` as `<type>/<kebab-topic>`, for example `feat/ticket-search` or `chore/codebase-conventions`. Types are the commit types below.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`.

- **Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **Scopes (optional):** `api`, `web`, `e2e`, `infra`, `deps`, `docs`.

```
fix(api): reject an empty ticket subject
docs: describe the folder layout
```

A `commit-msg` hook runs commitlint, so `update stuff` is rejected. The `pre-commit` hook formats and lints staged files.

## Pull requests

Fill in the PR template. `bun run check` must pass.
