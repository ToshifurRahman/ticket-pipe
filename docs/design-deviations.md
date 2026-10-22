# Where `web/` differs from the Relay Full Demo

The Relay Full Demo (https://claude.ai/artifact/KgujCr5HHmouNMgx9bHwzo) is the design authority for `web/`. Values are copied exactly. A value may differ only when it fails a hard gate (AA contrast, no horizontal scroll at 360px, keyboard use). This file lists every difference. Anything not listed here should match the demo; a mismatch is a bug.

## Values that differ

| Token | Demo | `web/` | Why |
| --- | --- | --- | --- |
| `--input` (field border, `rule-forest` in `web/tokens/colors.json`) | `#1F3A2E` | `#5E8A73` | A field boundary must reach 3:1 against its ground (WCAG 1.4.11). The demo's value is about 1.5:1. `--form-rule` keeps the demo's `#1F3A2E` for decorative ruling, where contrast is not required. |

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
