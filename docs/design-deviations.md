# Where `web/` differs from the Relay Full Demo

The Relay Full Demo (https://claude.ai/artifact/KgujCr5HHmouNMgx9bHwzo) is the design authority for `web/`. Values are copied exactly. A value may differ only when it fails a hard gate (AA contrast, no horizontal scroll at 360px, keyboard use). This file lists every difference. Anything not listed here should match the demo; a mismatch is a bug.

## Values that differ

| Token | Demo | `web/` | Why |
| --- | --- | --- | --- |
| `--input` (field border, `rule-forest` in `web/tokens/colors.json`) | `#1F3A2E` | `#5E8A73` | A field boundary must reach 3:1 against its ground (WCAG 1.4.11). The demo's value is about 1.5:1. `--form-rule` keeps the demo's `#1F3A2E` for decorative ruling, where contrast is not required. |

## Finish review fixes (story 6.18, 2026-10-22)

Approved fixes from the finish review. They are deliberate departures from the demo.

| Where | Demo | `web/` | Why |
| --- | --- | --- | --- |
| `/new` layout below `md` | Single implicit grid track | `grid-cols-[minmax(0,1fr)]`, `min-w-0` on the aside | The implicit track grew to the recent-tickets rows and caused horizontal scroll at 375px after a ticket was filed. |
| Landing FAQ, Replied card, On-hold message | "flagged for a person to follow up in the same thread", "never lost", "waiting in our team's queue" | "put on hold and flagged for the team", "stays on file", "flagged for the team"; the page updates "if it moves" | The pipeline has no human follow-up: the ops console can only replay a ticket. PRODUCT.md forbids promises it cannot keep. |
| Snag email | Subject "We're looking into TICK-…", "we're looking into it", "You'll get one more email when your reply is ready." | Subject "A snag on TICK-…", "It's on hold and flagged for the team.", "If a reply follows, we'll email you." | Same reason. |
| Ops table below `sm` | Status only in its own column | The status badge also sits under the reference (decorative, `aria-hidden`) | Status, category and priority were off-screen on a phone, so a needs-attention row looked like the rest. |
| Ticket "Office use" stamps before triage | A bare "-" | "Category -" and "Priority -" | The labels were screen-reader only, so the empty stamps looked broken. |
| Emails: form number | A narrow right-hand cell | Its own ruled row under the subject | The reference broke mid-string and the kicker wrapped at 375px. |

## Kept by decision

- **On hold plies.** The demo always puts "On hold" on ply 4 and shows plies 1 to 3 as done. The finish review noted that Triaged and Drafted are painted done when triage failed. Kept as the demo has it (decision of 2026-10-20, confirmed 2026-10-22).
- **Pricing buttons** all go to `/new`. Pricing is cosmetic (PRODUCT.md).
- **`/new` hero** stays above the success panel, as in the demo.

## Demo-only aids that are not ported

State toggles (ticket, confirm), the "Demo pages" dock, "Demo: fill an example", the demo token hint and "Demo: open the email link". The fake human check is the real Turnstile. The ops sign-in uses the real session, not a demo token.

## Behaviour that differs on purpose

- **Replay asks first.** The demo replays on one click. `web/` shows a confirm step because a replay spends AI calls.
- **Footer.** It sits at the bottom of the viewport on short pages. The demo's footer follows the content because its dock occupies that space.
- **Legal.** The tabs are links (`/legal/privacy`, `/legal/terms`), so each document has its own URL. `/privacy` and `/terms` redirect there.
- **Ops tabs** use `aria-selected` only, not `aria-pressed` as well.
- **Toasts** use Sonner, restyled to the demo's toast.

## Gates that are relaxed

- **Lighthouse SEO is not asserted on `/confirm/:token` and `/ops`.** Both are `noindex` on purpose (a private link and a staff console), so the `is-crawlable` audit fails them by design. See `lighthouserc.cjs`.
- **Breakpoints `521px` and `901px`** in `web/src/index.css` are hardcoded to the demo's values and carry a `ds-allow-hardcode` comment with the reason.

## Copy kept by decision

Two lines promise a speed the pipeline cannot guarantee. They match the demo word for word. Ruled "keep" on 2026-10-22:

- `/new` lead: "Most replies arrive within a minute."
- `/new` success panel: "A reply usually arrives within a minute."
