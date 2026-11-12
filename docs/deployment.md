# Deploying to Render

Story 7.9. This is the app-side deploy runbook: the blueprint in the repository, the variables
the service needs, and how to check a deployed instance. The AWS, Neon and Redis parts stay in
[production-infra.md](production-infra.md).

Nothing in this file is a credential. Replace every `<placeholder>`. The Render dashboard holds
the values; the repository holds only names.

## What the blueprint creates

`render.yaml` at the repository root declares one service:

| Setting             | Value                                                         |
| ------------------- | ------------------------------------------------------------- |
| `type`              | `web`                                                         |
| `runtime`           | `docker` (builds `./Dockerfile`)                              |
| `name`              | `relay`                                                       |
| `plan`              | `free`, one instance, no `numInstances`                       |
| `region`            | `singapore`                                                   |
| `branch`            | `main`                                                        |
| `healthCheckPath`   | `/health/ready`                                               |
| `autoDeployTrigger` | `checksPass`                                                  |
| `dockerCommand`     | `/bin/sh -c "bun scripts/migrate.ts && exec bun src/main.ts"` |

The runtime stage sets `WORKDIR /app/apps/api`, so both script paths in `dockerCommand` are
relative to it. The image already sets `ENV NODE_ENV=production`, so `NODE_ENV` is deliberately
absent from the blueprint.

**The one manual step:** in the Render dashboard choose New, then Blueprint, and point it at this
repository on the `main` branch. Render reads `render.yaml`, creates the service and asks for a
value for every variable marked `sync: false`. Nothing else is created by hand.

## Variables

Every variable the app reads in production is named in `render.yaml`. All entries are
`sync: false` with no `value:` key, so the dashboard is the only place a value lives. The list is
generated from the config schema (`ENV_KEYS` in `apps/api/src/lib/config.ts`) and the three web
build args; `apps/api/tests/guards/render-blueprint.test.ts` fails when the two drift apart.

`sync: false` is only prompted the first time the Blueprint creates the service. A variable added
to `render.yaml` later is not prompted: set it by hand in the dashboard before the next deploy,
or the process stops at startup with a message that names the missing variable.

| Variable                  | Required | What it is                                                             | Value comes from                         |
| ------------------------- | -------- | ---------------------------------------------------------------------- | ---------------------------------------- |
| `PORT`                    | no       | Listen port. Render supplies one; the default is 3000.                 | Render, or leave unset                   |
| `DATABASE_URL`            | yes      | Pooled Postgres URL the app and the worker use.                        | Neon, set in the Render dashboard        |
| `DATABASE_DIRECT_URL`     | no       | Direct Postgres URL. Only migrations use it.                           | Neon, set in the Render dashboard        |
| `REDIS_URL`               | yes      | Redis URL for counters, ops sessions and Socket.IO. Must be `rediss:`. | Redis Cloud, set in the Render dashboard |
| `SQS_ENDPOINT`            | no       | Queue endpoint. Leave unset in production to use real AWS.             | leave unset                              |
| `SQS_QUEUE_NAME`          | yes      | Main queue the worker reads.                                           | chosen name, set in the Render dashboard |
| `SQS_DLQ_NAME`            | no       | Dead-letter queue. Defaults to `<SQS_QUEUE_NAME>-dlq`.                 | same                                     |
| `WORKER_CONCURRENCY`      | no       | Tickets one worker processes at once. Default 10.                      | same                                     |
| `AWS_REGION`              | no       | AWS region for SQS and SNS. Default `us-east-1`.                       | same                                     |
| `AWS_ACCESS_KEY_ID`       | yes      | Access key of the `ticket-runtime` identity.                           | set in the Render dashboard              |
| `AWS_SECRET_ACCESS_KEY`   | yes      | Secret key of the `ticket-runtime` identity.                           | set in the Render dashboard              |
| `PORTKEY_API_KEY`         | yes      | Portkey gateway key. Required while `LLM_MODE` is real.                | set in the Render dashboard              |
| `GOOGLE_API_KEY`          | yes      | Gemini key for the `google` gateway.                                   | set in the Render dashboard              |
| `GROQ_API_KEY`            | no       | Groq key when Groq is the primary provider.                            | set in the Render dashboard              |
| `PRIMARY_GATEWAY`         | no       | `google` or `groq`.                                                    | chosen value                             |
| `PRIMARY_MODEL`           | no       | Model name for the primary gateway.                                    | chosen value                             |
| `BACKUP_GATEWAY`          | no       | Backup provider used when the primary fails.                           | chosen value                             |
| `BACKUP_API_KEY`          | no       | Key for the backup provider. No key means no backup.                   | set in the Render dashboard              |
| `BACKUP_MODEL`            | no       | Model name for the backup provider.                                    | chosen value                             |
| `AI_TIMEOUT_MS`           | no       | Per-call timeout. Default 30000.                                       | chosen value                             |
| `LLM_MODE`                | no       | Must be unset or `real` in production.                                 | leave unset                              |
| `LLM_FAKE_DELAY_MS`       | no       | Delay of a fake call. Tests only.                                      | leave unset                              |
| `OPS_TOKEN`               | yes      | Ops console sign-in token, at least 32 characters in production.       | generated secret, set in the dashboard   |
| `SNS_ENDPOINT`            | no       | SNS endpoint. Leave unset in production.                               | leave unset                              |
| `SNS_TOPIC_ARN`           | no       | Alert topic. Unset keeps ops email off.                                | AWS, set in the Render dashboard         |
| `SNS_ALERT_MAX_PER_HOUR`  | no       | Alert ceiling. Default 20.                                             | chosen value                             |
| `MAIL_DRIVER`             | no       | `brevo` in production, or unset to turn the email card off.            | chosen value                             |
| `SMTP_URL`                | no       | SMTP server for the `smtp` driver. Local testing only.                 | leave unset                              |
| `MAIL_FROM`               | no       | Sender address, verified with the provider.                            | set in the Render dashboard              |
| `MAIL_FROM_NAME`          | no       | Sender display name. Default `Relay`.                                  | chosen value                             |
| `BREVO_API_KEY`           | no       | Brevo key, required when `MAIL_DRIVER=brevo`.                          | set in the Render dashboard              |
| `MAIL_DAILY_CAP`          | no       | Customer emails per day. Default 250.                                  | chosen value                             |
| `PUBLIC_SITE_URL`         | no       | Public origin for links and the origin policy. Required with mail.     | the service URL, set in the dashboard    |
| `TURNSTILE_SECRET_KEY`    | yes      | Cloudflare Turnstile secret. Required in production.                   | set in the Render dashboard              |
| `TICKET_IP_HOURLY_LIMIT`  | no       | Submissions per address per UTC hour. Default 15.                      | chosen value                             |
| `TICKET_DAILY_CAP`        | no       | New tickets per UTC day. Default 100.                                  | chosen value                             |
| `VITE_TURNSTILE_SITE_KEY` | yes      | Site key baked into the web bundle.                                    | set in the Render dashboard              |
| `VITE_CF_ANALYTICS_TOKEN` | no       | Cloudflare Web Analytics token. Unset sends no analytics.              | set in the Render dashboard              |
| `VITE_SITE_URL`           | no       | Public origin for canonical links and the sitemap.                     | the service URL                          |

Required means the process refuses to start or the build fails without it. Empty counts as
unset, so a variable with a default can be left blank.

### The three build args

Render passes a Docker service's environment variables to the image build as build arguments, so
the same three names serve the build and the runtime:

- `VITE_TURNSTILE_SITE_KEY` is required. The Dockerfile fails the build without it, on purpose:
  without the key the web app silently falls back to Cloudflare's always-pass test key, which
  would let the production site accept unverified submissions. Set the real site key.
- `VITE_CF_ANALYTICS_TOKEN` and `VITE_SITE_URL` are optional. Without them the bundle sends no
  analytics and builds relative canonical links.

`VITE_*` values are public by nature: they end up in the JavaScript the browser downloads. Never
put a secret in one. The Turnstile secret is `TURNSTILE_SECRET_KEY`, not the site key.

## Migrations

The free plan has no pre-deploy command, so the migration is part of the start command:

```
/bin/sh -c "bun scripts/migrate.ts && exec bun src/main.ts"
```

- `apps/api/scripts/migrate.ts` is idempotent. It creates `schema_migrations` if it is missing,
  skips files already recorded there, and runs each file in its own transaction. It prefers
  `DATABASE_DIRECT_URL` and falls back to `DATABASE_URL`.
- The `&&` is the guard: a migration that exits non-zero stops the command, so the server never
  starts against a half-migrated schema and Render marks the deploy failed.
- `exec` replaces the shell with the server, so bun becomes PID 1. Render sends SIGTERM to PID 1
  on every deploy and waits for the process to exit; without `exec` the shell keeps the signal to
  itself, the server's shutdown drain never runs, in-flight tickets are killed, and Render waits
  out its full timeout before SIGKILL.
- Every cold start re-runs the migration, because the free plan spins the service down. That is
  cheap: with nothing to apply the script prints `nothing to migrate` and exits.

## Deploys and CI

`autoDeployTrigger: checksPass` means Render deploys a new commit on `main` only after every CI
check on that commit has passed.

- A failing check blocks the deploy. The previous version keeps serving.
- When no check is reported at all, Render does not deploy either. A workflow that stops running
  therefore stops deploys; check the Actions tab before assuming a deploy is pending.
- A manual deploy from the dashboard still works and is the way to roll forward after a fix.

## Free plan behavior

- The service spins down after 15 minutes without inbound HTTP or WebSocket traffic. The next
  request starts it again; the first response after a cold start is slow.
- A workspace gets 750 free instance hours a month. When they run out, free services are
  suspended until the next month.
- Neon suspends compute after 5 minutes of inactivity and cannot be made to wait longer. The first
  database query after that is slow. Each project has 100 CU-hours a month; when they run out the
  compute is suspended until the next billing period.
- A keep-awake pinger, if one is used, must call `/health/live`, which touches no database,
  so the pinger itself adds no queries. It does not save Neon CU-hours: while Render stays
  awake, Render's own `/health/ready` checks keep running and each one queries Postgres.
  They run every few seconds, so Neon never reaches its 5-minute idle window and the compute
  allowance is spent anyway. A keep-awake pinger trades Render spin-down for Neon compute.
- Render sends health checks every few seconds. After 15 seconds of consecutive failures it stops
  routing traffic to the instance; after 60 seconds it restarts the instance. A restart reruns the
  same deployed version, so it only helps when the failure was transient, such as a slow database
  start. It does not fix a broken build. A new deploy that never passes `/health/ready` does not
  replace the old version: the old one keeps serving, and the deploy is marked failed.

## Checking the client address (PA-7.5-04)

The per-address rate limit is keyed by `clientIp()` in `apps/api/src/middleware/client-ip.ts`,
which returns the **last** hop of `X-Forwarded-For` (the one Render's proxy appends) and the
string `local` when the header is absent. Behind Render's proxy that is the caller's address. If
the header ever went missing, every caller would share the key `tickets:ip:local:<UTC hour>` in
Redis: one abuser would then spend the shared hourly budget and rate-limit everyone else with a 429.

Check it on the deployed service:

1. From two different networks, submit one ticket each against the service URL (a request that
   fails the Turnstile check still counts the address first, so any POST to `/api/tickets` is
   enough):

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<service-host>/api/tickets \
     -H 'content-type: application/json' \
     -d '{"subject":"Address check","description":"Checking the rate-limit key."}'
   ```

2. From a trusted machine, scan the counter keys for the current UTC hour:

   ```bash
   redis-cli -u "$REDIS_URL" --scan --pattern 'tickets:ip:*'
   ```

3. The result must be one key per client address, for example
   `tickets:ip:203.0.113.10:2026-11-12T04`, and must contain no `tickets:ip:local:*` key. Two
   clients must produce two different keys. A `local` key means the proxy stopped sending the
   header: stop and fix it before inviting traffic.

Do not trust a client-supplied header as the check: earlier hops in `X-Forwarded-For` are written
by the caller. The key that matters is the last hop Render adds.

## Rollback

A rollback restores the **build only**. Render keeps the service's current configuration, so the
environment variables in the dashboard stay as they are and are not rolled back with the image.
If a bad deploy also changed a variable, put the old value back by hand.

- Fastest: in the Render dashboard open the service, go to Deploys, pick a previous successful
  deploy and choose rollback. Render deploys that build with the current environment, and it
  **turns auto-deploy off for the service**. Re-enable it in Settings, Auto-Deploy, once the fix
  is on `main`. Until then, a merge to `main` will not deploy.
- Durable: revert the merge commit on `main` with `git revert`, push the revert, and then check
  that auto-deploy is on. If a rollback turned it off, turn it back on in Settings, Auto-Deploy;
  only then will CI and `autoDeployTrigger: checksPass` deploy the revert. Never `git push
--force` to rewrite `main`.
- A migration never needs a down script for a rollback: the previous image ignores tables it does
  not know. Do not drop columns or tables in a deploy you might roll back.

## What stays manual

A deploy does not create infrastructure. These stay with a maintainer, as written in
[production-infra.md](production-infra.md):

- The two IAM identities and their policies, and the runtime keys in the Render dashboard.
- The SQS queues, the dead-letter queue and its redrive policy.
- The SNS topic and its confirmed email subscription, then `SNS_TOPIC_ARN`.
- The $1 AWS budget alert and the calendar reminder.
- The Neon project and its pooled and direct URLs, and the Redis Cloud database.
- The first visit to the Turnstile widget settings, so the deployed hostname is allowed.
