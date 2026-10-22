---
name: Relay
description: AI help desk drawn as a carbonless service form; each pipeline stage stamps a ply.
colors:
  forest: "#08130F"
  scrim-black: "#000000"
  forest-2: "#0E1D17"
  forest-3: "#152A21"
  form-ground: "#0B1511"
  form-rule: "#1F3A2E"
  form-mute: "#A3CCB7"
  hair-forest: "#1D3529"
  rule-forest: "#5E8A73"
  bone: "#E8F3EC"
  mute-forest: "#93AE9F"
  coral: "#FF7062"
  ply-bone: "#E4EEE8"
  ply-mint: "#34C98B"
  ply-orange: "#FF7A1A"
  ply-green: "#166534"
  ply-yellow: "#FFD84D"
  ply-edge: "#3FA766"
  hold-forest: "#56645D"
  ink-on-ply: "#04140C"
  ink-on-orange: "#1A0A00"
  ink-on-yellow: "#1A1400"
  hero: "#044F34"
  billing: "#F2B84B"
  account: "#B79CFF"
  bug: "#FF8A7A"
  tech: "#7FB0FF"
  feature: "#4FD9CB"
  low: "#C9D6CF"
  med: "#F5DD5A"
  high: "#FFA04D"
typography:
  label:
    fontFamily: "'Archivo Narrow', 'Arial Narrow', ui-sans-serif, sans-serif"
    fontSize: "0.6875rem to 0.875rem"
    fontWeight: 700
    letterSpacing: "0.08em"
  body:
    fontFamily: "'Public Sans Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    lineHeight: 1.55
  mono:
    fontFamily: "'Courier Prime', ui-monospace, monospace"
    fontSize: "0.8125rem"
rounded:
  none: "0"
spacing:
  unit: "4px"
components:
  button-default:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.forest}"
    rounded: "{rounded.none}"
    height: "48px"
    padding: "0 24px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.bone}"
    rounded: "{rounded.none}"
    height: "48px"
    padding: "0 12px"
  form-panel:
    backgroundColor: "{colors.form-ground}"
    textColor: "{colors.bone}"
    rounded: "{rounded.none}"
---

# Design System: Relay

The Relay Full Demo (https://claude.ai/artifact/KgujCr5HHmouNMgx9bHwzo) is the design authority. `web/` copies its values. Every difference, and every decision kept on purpose, is listed in [docs/design-deviations.md](docs/design-deviations.md); that file also lists the story 6.18 finish-review fixes. Do not repeat or override it here. Source of truth for tokens: `web/tokens/colors.json` and `web/tokens/scale.json` (DTCG), compiled to `web/src/styles/tokens.css` by `bun run tokens`.

## Overview

**Creative North Star: "Carbon Set"**

Relay files each support request as a carbonless multi-part service form. Each pipeline stage (Received, Triaged, Drafted, Replied) stamps its own ply onto the form while the customer watches. The ground is forest-black, the form is printed in hairline ruling, and the plies are flat fields of bone, mint, orange and deep green. Yellow is the live ply. Coral is urgent only.

The theme is dark only. There is no light theme and no theme toggle (`color-scheme: dark`). History, one line: the earlier violet/starfield look and the Red Rule palette are retired.

**Key Characteristics:**
- Flat and square: radius 0, no shadows, no blur, no gradients.
- Three families with fixed jobs: Archivo Narrow caps for printed labels, Courier Prime for numbers, Public Sans for reading.
- One motion grammar: hard steps, no easing. The signature is the 90ms `steps(2)` stamp.
- Tailwind palettes, radii, shadows and blurs are cleared; a utility without a token does not exist.

## Colors

Green stock: a forest-black ground, a green hero band, and plies as flat fields. Hex values are the DTCG primitives; components use the semantic roles.

### Colour primitives

| Token | Hex | Role |
| --- | --- | --- |
| `forest` | `#08130F` | Carbon ground; ink on a light ply |
| `scrim-black` | `#000000` | Scrim behind a drawer (55% opacity) |
| `forest-2` | `#0E1D17` | Card and popover surface |
| `forest-3` | `#152A21` | Raised surface: secondary, muted, accent hover |
| `form-ground` | `#0B1511` | Ground a service form is printed on |
| `form-rule` | `#1F3A2E` | Decorative ruling inside a form and its outer edge (about 1.5:1) |
| `form-mute` | `#A3CCB7` | Secondary text on a form |
| `hair-forest` | `#1D3529` | Decorative ruling on carbon (border, rule) |
| `rule-forest` | `#5E8A73` | Control boundary on carbon, 3:1 or better |
| `bone` | `#E8F3EC` | Ink on carbon; primary action fill; link; focus ring |
| `mute-forest` | `#93AE9F` | Secondary text on carbon |
| `coral` | `#FF7062` | Urgent and field errors only |
| `ply-bone` | `#E4EEE8` | Ply 1, Received |
| `ply-mint` | `#34C98B` | Ply 2, Triaged |
| `ply-orange` | `#FF7A1A` | Ply 3, Drafted |
| `ply-green` | `#166534` | Ply 4, Replied |
| `ply-yellow` | `#FFD84D` | The live ply |
| `ply-edge` | `#3FA766` | The Replied ply edge |
| `hold-forest` | `#56645D` | On hold slab |
| `ink-on-ply` | `#04140C` | Ink on the mint ply |
| `ink-on-orange` | `#1A0A00` | Ink on the orange ply |
| `ink-on-yellow` | `#1A1400` | Ink on the live ply |
| `hero` | `#044F34` | Hero and top bar band |
| `billing` | `#F2B84B` | Topic: billing |
| `account` | `#B79CFF` | Topic: account |
| `bug` | `#FF8A7A` | Topic: bug |
| `tech` | `#7FB0FF` | Topic: technical |
| `feature` | `#4FD9CB` | Topic: feature request |
| `low` | `#C9D6CF` | Priority: low |
| `med` | `#F5DD5A` | Priority: medium |
| `high` | `#FFA04D` | Priority: high |
### Semantic roles

Semantic names map to CSS custom properties (emitted by `tokens.css`).
- **Surfaces:** `background` forest; `card` and `popover` forest-2; `secondary`, `muted`, `accent` forest-3; `form` form-ground; `overlay` scrim-black at 55%.
- **Text:** `foreground` bone; `muted-foreground` mute-forest; `form-muted` form-mute (inside a form); `link` bone; `primary-foreground` and `destructive-foreground` forest.
- **Action:** `primary` bone (default button fill); `destructive`, `warning`, `stamp-urgent` coral.
- **Borders:** `border` and `rule` hair-forest; `form-rule` form-rule; `input` rule-forest; `ring` bone.
- **Plies:** `ply-received` ply-bone on forest ink; `ply-triaged` ply-mint on ink-on-ply; `ply-drafted` ply-orange on ink-on-orange; `ply-replied` ply-green on bone with `ply-replied-edge` ply-edge; `ply-live` ply-yellow on ink-on-yellow (`ply-live-ink` is yellow as text on carbon); `ply-on-hold` hold-forest on bone.
- **Band:** `hero` on bone text (`hero-foreground`). The `.on-hero` scope re-maps the shared controls to ink on this band.
- **Topic stamps:** billing, account, bug, tech, feature. **Priority stamps:** low, medium, high, urgent (coral). Each has an outline colour and a `-fill` twin for a stamp printed on a coloured ply.

### Named Rules

**The Yellow Is Live Rule.** Yellow marks the one ply in progress and nothing else (the ops badge for processing uses it as ink). Never use it as decoration.

**The Coral Is Urgent Rule.** Coral is for urgent priority and field errors. No other use.

**The Field Edge Rule.** A control boundary uses `rule-forest` (`input`), which clears 3:1. `form-rule` and `hair-forest` are decorative ruling only; never put them on a control. This `input` value is a listed deviation from the demo.

**The Ink Pairing Rule.** Every ply has its own ink (`ink-on-ply`, `ink-on-orange`, `ink-on-yellow`, forest, bone). Do not pair a ply with another ply's ink.

## Typography

**Label font:** Archivo Narrow (fallback 'Arial Narrow', ui-sans-serif), weight 700, uppercase.
**Body font:** Public Sans Variable (fallback ui-sans-serif, system-ui). Reading text, titles, inputs.
**Mono font:** Courier Prime (fallback ui-monospace). References, times, counters, KPIs; tabular figures.

All fonts are self-hosted.

**Character:** a printed form: narrow stamped caps, typewriter numerals, a plain humanist face for the sentences.

### Hierarchy (scale from `scale.json`)
- **caption** 0.6875rem (11px), **xs** 0.75rem (12px, line-height 1.333), **meta** 0.8125rem (13px), **sm** 0.875rem (14px, 1.43), **base** 1rem (16px, 1.55), **lg** 1.125rem, **xl** 1.25rem, **2xl** 1.5rem, **3xl** 1.875rem (1.2), **4xl** 2.25rem, **5xl** 3rem (1.0).
- **Form title:** Public Sans 600, 1.625rem (26px), line-height 1.15, tracking -0.01em, balanced.
- **Label caps** (`label-caps`): Archivo Narrow 700, uppercase, tracking 0.08em, line-height normal. Kickers inside the form header, chips, field captions, ply labels.
- **Button caps** (`button-caps`): same face, tracking 0.1em. Buttons, nav, stamps, table heads.
- **Mono:** refs at 13px (`meta`); ply numbers 12px; ply times 10px on phone, 12px from `sm`.

### Named Rules

**The Three Jobs Rule.** Caps labels never carry sentences; Courier never carries prose; Public Sans never prints a label.

## Layout

Page column 77rem (1232px: 1200px of content plus a 16px gutter each side), centred. Spacing is a 4px unit; every utility is a multiple. Hairline 1px, heavy rule 2px.

Breakpoints are the demo's: `sm` 521px and `md` 901px (hardcoded, media queries cannot use variables). Below `md` layouts are one column; from `md` the ticket page is a 12-column grid (form in columns 1 to 9, Office use in 10 to 12). On a phone the ply row and latest message fill the first screen and Office use follows. `/new` uses `grid-cols-[minmax(0,1fr)]` below `md` to avoid horizontal scroll at 375px.

Fixed measures: control height 48px (40px small); content 1200px; ops table minimum 820px (scrolls inside its box below that); table cell max 300px; Turnstile slot 65px reserved so it never shifts layout; landing stage strip 44px, 56px from `md`; top bar 64px. The footer sits at the bottom of short viewports.

## Elevation & Depth

None. There are no shadows, blur, glow or gradients. Depth is tonal: ground (forest), card (forest-2), raised (forest-3), form (form-ground) with a 1px ruled edge. The only box-shadow in the build is the inset 1px hover ring on outline and tab buttons and the transient idle-nudge ring; both are rules, not elevation.

### Motion

- **Stamp:** 90ms, `steps(2, jump-none)`. A stage lands, hover and press change in one step. Instant under `prefers-reduced-motion`.
- **Press:** 135ms rubber stamp: blank, pressed oversize (scale 1.15), set at -3deg. Confirmed stamps land 120ms after a click; ops sign-in stamps at 300ms and 435ms.
- **Print:** the page prints in on load by clip-path in hard steps: headline 270ms, form 480ms (after the headline), hero button 135ms starting at 750ms. A reply prints one line per 180ms. Toasts print in over 135ms.
- **Nudge:** an untouched hero button presses itself down twice, 240ms each.
- **Sweep:** a rate tier sweeps in over 270ms in three steps.

**The No Easing Rule.** Every transition is a hard step. No fades, springs or cubic-bezier curves.

## Shapes

Square. Radius is 0 everywhere. Edges are 1px hairlines; focus and the active tab use the 2px heavy rule. Stamps are bordered boxes tilted -3deg (`stamp-tilt`), the one rotation in the system. Status marks are small square pips, not circles.

## Components

### Ply stack and printed-form anatomy
Signature component. A **FormPanel** is one ruled sheet on form-ground (`form-surface` swaps the semantic colours to the form's own) that holds, top to bottom: **FormHeader** (caps kicker, title, ruled "No." cell with the ref in Courier and an optional Copy button), the **PlyRow** (`ol`, four equal cells: stage number, caps label, printed time), the thread, and a ruled **FormFoot**. **FormBody** is the padded body for non-ply forms (fields, notes, buttons).
- Ply states: `done` (its own ply colour), `live` (yellow, time shows "in progress" or the stopwatch on the landing sample), `waiting` (transparent, muted print), `on-hold` (hold-forest on bone). Done and live cells drop their divider; ply cells have a min height of 72px.
- A ply that changes state after load is stamped in; nothing else on the row moves. Screen readers get "stage N, state".
- "On hold" always sits on ply 4, plies 1 to 3 painted done (listed in the deviations file).
- The mark (brand-mark) is a four-bar ply stack in bone, mint, orange and ply-edge.

### Buttons
Printed caps on square stock, 48px high (40px small, 48px square icon). Variants: **default** (bone fill, forest ink), **solid** (foreground fill, background ink), **outline** (current-colour border, inset hair ring on hover), **tb** (small text button, hairline rule, `aria-pressed`, `aria-selected` or `aria-current=page` fills with card), **ghost**. A press sets the button down 1px. Disabled is 45% opacity. Focus is the global 3px ring offset 2px.

### Inputs, textarea, label, form
Ruled field: 48px, 1px `input` border, transparent ground, Public Sans 16px, placeholder at 75% muted. Hover and focus-visible turn the border bone; `aria-invalid` turns it coral. Errors are coral text. Turnstile slot is reserved at 65px.

### Stamps and chips
**Stamp** is printed caps set at the shared tilt. **ToneChip** is a stamp with a 1px border: outline (colour on text and rule, for a ticket's own page) or fill (bright slab with dark rule, for a key on a coloured ply). Category is matched from free text; the model's `critical` priority shows as urgent.

### Status
**OpsStatusBadge**: caps, 1px current-colour border, square pip. queued is muted, processing is live-ink yellow, completed is mint, failed is coral, needs_attention is high-priority orange. Customer-facing pill folds failures into "With our team".

### Navigation
Top bar and hero share the green `hero` band (`.on-hero`). Brand mark plus "Relay", Track field, button-caps links (hidden below `md`). Skip link first. Links are underlined (1px, 2px on hover).

### Ops
KPI strip, status tabs (tb buttons), sortable paginated ledger (head in button caps, mono cells), ticket drawer (Sheet on the scrim at 55%) with the event history, replay with a confirm step, sign-in card with two staggered "Staff only" stamps. Below `sm` the status badge repeats under the reference.

### Ticket page parts
Office use column (category and priority stamps, per-stage times, email opt-in card), thread (customer text right-aligned on the bone ply; reply prints line by line), closed and state panels (loading, not found, on hold with one neutral message), recent tickets list, success panel on `/new`, landing hero, stages, demo ticket, pricing and FAQ. Toasts are Sonner restyled to print in.

## Email system

Customer emails (`src/services/notification-emails.ts`) are Carbon Set on paper: HTML tables with inline styles, `role=presentation`, 560px maximum, white page, no external fonts, images or tracking. A hero band (#044F34) carries the four-bar mark and "RELAY" in caps; below it a ruled form (rule #C9D6CF, ink #08130F, muted #56645D) with a caps kicker "Service ticket · Customer copy", subject at 22px, the form number in its own ruled row, a four-cell ply row (replied or on hold), body at 16px/1.55, and one button in forest with bone caps. Font stacks fall back to web-safe faces: Archivo Narrow, Arial Narrow, Arial; Courier Prime, Courier New, Courier; Public Sans, Arial, Helvetica. The preheader is hidden text.

## Accessibility contract

- WCAG 2.1 AA on every route and key state; field boundaries 3:1; focus ring 3px bone, offset 2px.
- No horizontal scroll at 360px. Full keyboard use; skip link first.
- `prefers-reduced-motion` disables all animation and transition; the landing demo shows its final frame.
- Live regions on the ticket thread and on Copy; ply state is spoken, not only coloured.
- State is never colour alone: stage names, status words and pips carry it.
- Fonts self-hosted; no `innerHTML`; main JS chunk under 500 kB.

## Voice

From PRODUCT.md: believable, not demonstrative.
- Show the work: say what stage the ticket is in, specifically.
- Failure is calm and neutral ("On hold", "With our team") with a next step; no error details to the customer.
- Never promise what the pipeline cannot keep: no human follow-up, no guaranteed times beyond the two kept lines below.
- No invented customers, logos, testimonials, stats or benchmarks. Pricing is cosmetic. Architecture and tech detail stay in the README.
- Brand name "Relay", tagline "AI help desk"; copy lives in `web/src/config/brand.ts` and `web/src/content/`.
- Plain language, short sentences, no em-dash filler.

## Do's and Don'ts

### Do:
- **Do** take values from `tokens.css` variables; add a token in the JSON first, then run `bun run tokens`.
- **Do** keep every state change a hard step (90ms `steps(2)` or the stepped print).
- **Do** print labels in Archivo Narrow caps, numbers in Courier Prime, sentences in Public Sans.
- **Do** wrap new form surfaces in FormPanel so ruling and form colours come for free.
- **Do** give each ply its own ink and keep the live ply the only yellow.

### Don't:
- **Don't** add a light theme, a theme toggle, rounded corners, shadows, blur, gradients or glow.
- **Don't** use coral for anything but urgent and errors.
- **Don't** put a decorative rule colour on a control boundary.
- **Don't** use easing, fades or springs.
- **Don't** put architecture or tech detail on the site, or copy the retired violet/starfield look.
- **Don't** hardcode hex in components (the only literals are the theme-color meta tag, the two breakpoints, and email inline styles).

## Known items

Accepted at ship:
- Ops list at 375px clips the Subject column without an ellipsis. Cosmetic; the drawer shows the full title.
- The empty gap above NOTIFY ME / SUBMIT on a phone is the Turnstile slot reserved for Cloudflare's 65px widget. It only looks empty when the widget is stubbed in captures.
- "On hold" always sits on ply 4 with plies 1 to 3 painted done, as in the demo.
- The two "within a minute" /new copy lines are kept by decision (see the deviations file).
