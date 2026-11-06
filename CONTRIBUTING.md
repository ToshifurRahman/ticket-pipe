# Contributing

## Setup

**Needs:** Bun 1.3+, Node 24.22.1+ (Vitest runs on Node), Docker.

```bash
bun install
cp .env.example .env
docker compose up -d --wait   # Postgres, Redis, LocalStack, Mailpit
bun --filter @ticket-pipe/api migrate
bun --filter @ticket-pipe/api setup
```

Run the app:

```bash
bun --filter @ticket-pipe/api dev      # API on :3000
bun --filter @ticket-pipe/api worker   # second terminal
bun --filter @ticket-pipe/web dev      # Vite on :5173
```

For a production-style local run, `bun run build` then `bun --env-file=.env run start` (both services in one process). Use `start:api` or `start:worker` to run either alone.

Set `LLM_MODE=fake` in `.env` to work without an AI provider. See the [README](README.md) for the full quick start and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for where things go.

## Scripts

Run these from the repo root.

| Script                                    | Does                                                      |
| ----------------------------------------- | --------------------------------------------------------- |
| `bun run check`                           | Format check, lint, typecheck and tests. Run before a PR  |
| `bun run build`                           | Type-check the API and build `apps/web/dist`              |
| `bun run start`                           | API and worker together (reads the process environment)   |
| `bun run start:api`                       | API only                                                  |
| `bun run start:worker`                    | Worker only                                               |
| `bun run format`                          | Prettier over the whole repo                              |
| `bun run lint`                            | ESLint, zero warnings allowed                             |
| `bun run typecheck`                       | `tsc` for the API, web and root                           |
| `bun run test`                            | Every workspace's Vitest suite (integration needs Docker) |
| `bun --filter @ticket-pipe/api test:unit` | API unit and guard tests only, no Docker                  |
| `bun run test:e2e`                        | Playwright against the built app                          |

Never `bun test` (Vitest must run on Node), and never `tsc -p apps/api` without `--noEmit`: its tsconfig emits `.js` next to the sources.

Stop any dev worker before `test:e2e`, since it reads the same queue. A Redis already running on the host (port 6379) shadows the compose one.

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
