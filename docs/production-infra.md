# Production infrastructure runbook

The steps a maintainer runs by hand to put the app on real AWS, Neon and Redis Cloud, plus the
local checks that prove the code is ready. Story 7.8; leftovers are tracked as PA-7.8-03 and in
story 7.12.7.

Nothing in this file is a credential. Replace every `<placeholder>`. Never use root AWS keys:
create the two IAM identities below and nothing else.

## 1. Neon (Postgres)

Neon gives two connection strings for a database:

- **Pooled** (`...-pooler...`): the app runtime, set as `DATABASE_URL`.
- **Direct**: migrations and other DDL, set as `DATABASE_DIRECT_URL`.

Both need TLS (`sslmode=require` or stronger). `apps/api/scripts/migrate.ts` uses
`DATABASE_DIRECT_URL` when it is set and falls back to `DATABASE_URL`, so run migrations
before starting the app:

```bash
bun --filter @ticket-pipe/api migrate
```

The app itself keeps reading `DATABASE_URL`; it never reads the direct URL.

## 2. Redis Cloud

The provider in use is Redis Cloud (this amends the story's Upstash line). Create a database,
copy its TLS URL into `REDIS_URL`, and make sure the scheme is `rediss:`.

To check TLS is on:

1. The database page shows a TLS-only endpoint and the URL starts with `rediss://`.
2. `redis-cli -u "$REDIS_URL" PING` returns `PONG`; the same URL with `redis://` must be refused.
3. `smoke:infra` prints `redis ok` and `redis-tls ok`. `redis-tls` is WRONG for any non-
   `rediss:` scheme even when PING succeeds.

### Command budget (PA-7.8-04)

Measured on the local stack inside one `run-check.sh` call, with the API and one worker up,
`LLM_MODE=fake`, and one ticket processed end to end (inserted queued, enqueued, then polled to
`completed`). `INFO commandstats` was read before, after the ticket, and after 5 idle minutes:

- **Per ticket: 10 commands**, all `PUBLISH` (Socket.IO events). The ticket was enqueued directly,
  so the API submission path's `INCR`/`EXPIRE` counters are not part of this figure; a real
  submission adds a handful more.
- **Per idle hour: 0 commands** over the 5-minute sample, because every Redis client connects
  lazily and socket clients do not poll while idle.

Other clients on the same host Redis can inflate these counts. Re-measure on the production
instance before sizing the plan.

## 3. IAM identities

Two identities, no root keys:

| Identity         | Policy                          | Used by                                 |
| ---------------- | ------------------------------- | --------------------------------------- |
| `ticket-runtime` | `infra/iam/runtime-policy.json` | the API and worker processes            |
| `ticket-setup`   | `infra/iam/setup-policy.json`   | `setup-infra.ts`, run once, then delete |

Create both policies with `aws iam create-policy`, substituting `<region>`, `<account-id>`,
`<main-queue>`, `<dlq>` and `<topic>`. Then create access keys for each identity and store them
in the platform's secret store, never in the repository.

The runtime policy has exactly the four SQS actions the code calls (`GetQueueUrl`,
`SendMessage`, `ReceiveMessage`, `DeleteMessage`) on the main queue, and `sns:Publish` on the
alert topic. It has no DLQ permission because the runtime never reads the DLQ: redrive is done
by SQS itself, and replay reads the database. The setup policy creates and configures both
queues and is not attached to anything that serves traffic. `apps/api/tests/guards/iam-policy.test.ts`
fails if the runtime policy and the imported SDK commands drift apart, or if any action or
resource contains a wildcard.

## 4. Create the queues

Run once with `SQS_ENDPOINT` unset or empty and the setup identity's keys:

```bash
SQS_ENDPOINT= SNS_ENDPOINT= bun --filter @ticket-pipe/api setup
```

This creates the main queue, the DLQ and the redrive policy (`maxReceiveCount` 10). It is
idempotent: re-running succeeds. The script refuses the local `test` placeholder credentials
when no endpoint is set, so a local `.env` cannot accidentally target AWS.

## 5. SNS topic and email subscription

`setup-infra.ts` only creates an SNS topic against a local endpoint. In AWS, create it by hand:

```bash
aws sns create-topic --name ticket-needs-attention --region <region>
aws sns subscribe --topic-arn <topic> --protocol email --notification-endpoint <ops-email>
```

Confirm the subscription from the email, then set `SNS_TOPIC_ARN` in production. Without it the
app skips ops alerts and everything else still works.

## 6. Budget alert and calendar reminder

- Create a **$1 monthly AWS Budget** with an email alert at 100% (and optionally 80%). AWS
  Budgets is free for the first two budgets.
- Add a calendar reminder **before 2027-04-03**, when the AWS free-usage period used by this
  project ends, to review spend and decide on ElasticMQ (below).

## 7. Switch to ElasticMQ (hosting is an open decision)

PA-7.8-03: ElasticMQ needs a host, because the current free hosting plan sleeps. This is also
story 7.12.7. Until a host is chosen, keep using AWS SQS. The switch itself is one variable.

Locally, the proof:

1. Start the profile (it does not touch the other compose services):
   `docker compose --profile elasticmq up -d elasticmq`
2. Create the queues without SNS. Only `SQS_ENDPOINT` changes; `SNS_ENDPOINT` must be empty
   because ElasticMQ has no SNS:
   `SQS_ENDPOINT=http://localhost:9324 SNS_ENDPOINT= bun --env-file=.env apps/api/scripts/setup-infra.ts`
3. Run one send, receive and delete through the app's queue module with the same overrides.
4. Stop it: `docker compose --profile elasticmq stop elasticmq`.

For production, point `SQS_ENDPOINT` at the ElasticMQ host and leave `SNS_ENDPOINT` unset.
Credentials can stay as configured; ElasticMQ ignores them. Nothing else in the app changes.

## 8. Smoke test

Run the API and worker with the production environment, then:

```bash
bun --filter @ticket-pipe/api smoke:infra
```

One line per check, `<name> ok` or `<name> WRONG`; exit code 0 only when every line is `ok`.
It never prints a value, URL, host, ARN, account id, message id or error text.

- `aws-identity`: STS `GetCallerIdentity` succeeds and the ARN is not an account root.
- `aws-not-local`: `SQS_ENDPOINT` is unset or empty, so the app is pointed at real AWS.
- `sqs-round-trip`: sends one unique smoke message to the main queue, receives that exact
  message and deletes it.
- `postgres`: `SELECT 1` over a TLS connection. `sslmode=disable` and non-postgres URLs are WRONG.
- `redis`: `PING` returns `PONG`.
- `redis-tls`: the URL scheme is `rediss:`.

Any check that throws is printed as `WRONG`; the error is deliberately swallowed to keep URLs,
keys and ARNs out of the output.

## 9. Manual checklist

- [ ] Neon pooled and direct URLs in the secret store; migrations run against the direct URL.
- [ ] Redis Cloud TLS URL in `REDIS_URL`.
- [ ] `ticket-runtime` and `ticket-setup` identities, no root keys.
- [ ] Queues and redrive policy created with the setup identity.
- [ ] SNS topic, confirmed email subscription and `SNS_TOPIC_ARN`.
- [ ] $1 budget alert.
- [ ] Calendar reminder before 2027-04-03.
- [ ] ElasticMQ host decision (PA-7.8-03, story 7.12.7).
- [ ] `smoke:infra` all `ok`.
