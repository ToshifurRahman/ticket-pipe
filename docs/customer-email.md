# Customer email

A customer can ask to be emailed instead of keeping `/t/:ref` open. The "Don't want to wait?" card appears on a
ticket that has no reply yet; `/new` is unchanged.

1. The customer enters an address (Turnstile token required, 5 opt-ins per IP per hour). We email a link to
   `/confirm/:token`. The link opens a page with a **Confirm** button, and only the button's `POST` confirms,
   because mail scanners open links on their own and a `GET` that confirmed would let them confirm for the customer.
2. After that, at most two more emails: **reply ready** when the ticket completes, and one **we're looking into
   it** the first time it ends `failed` or `needs_attention`. A replay that later completes still sends the
   reply. Confirming after the outcome already happened sends it straight away (`notifyIfDue`).
3. Emails carry the subject, the reference and a link, never the description or the reply.

The address is set once per ticket (a second attempt gets `409`) and lives alone in `ticket_notifications`, so
no ticket query can pick it up by accident. It is masked (`t•••@gmail.com`) on every customer and ops surface,
never logged or put in an event (`tests/notifications.guard.test.ts`), and removed with its ticket by the
30-day retention purge. Sending is best effort, like the ops alert: an atomic claim column per email, three
retries (1s/4s/15s) and a `notification.failed` event for ops if they run out. A daily cap (`MAIL_DAILY_CAP`,
default 250) protects the free quota.

`src/lib/mailer.ts` is the only module that sends mail, behind one interface with three drivers:

| `MAIL_DRIVER` | Used for |
| --- | --- |
| `smtp` | Local dev and e2e. `docker compose up -d` starts Mailpit (SMTP `:1025`, inbox and API at http://localhost:8025). |
| `brevo` | Production. Brevo's HTTPS API, because Render's free plan blocks outbound SMTP ports. Needs `BREVO_API_KEY`, `MAIL_FROM` (a sender verified in Brevo) and `PUBLIC_SITE_URL`. |
| `memory` | Vitest. |

Unset `MAIL_DRIVER` turns the feature off (the card is hidden and the opt-in endpoint answers `503`). In
production only `brevo` is accepted. The free Brevo plan needs no card and allows 300 emails a day, but with no
domain of our own the mail is sent from a single verified sender address (a dedicated Gmail), which fails
DMARC alignment, so some messages may land in spam. The e2e tests (`e2e/notifications.spec.ts`) read the mail
back through Mailpit's API.

