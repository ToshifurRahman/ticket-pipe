---
version: 1
slug: "web-src-pages-ticket-tsx"
primary_target: "web/src/pages/ticket.tsx"
related_targets: ["web/src/pages/home.tsx"]
---

## Scope

`/t/:ref`, the customer ticket page. Mode: Operate (the visitor watches a task get done). Lead surface of the Carbon Set redesign: the landing demo, `/new`, `/ops` and emails inherit from it.

## Audience and job

A customer who just filed a support request (often on a phone, sometimes from an email link) wants to know what's happening to it and read the reply. Task: watch progress, read the reply, opt in to email, open a new ticket. States: received, triaging, drafting, completed, failed, needs_attention, requeued, loading, not found.

## Constraints

Public view shows only subject/description, category/priority, customer reply and `{event, occurredAt}` events. Failure details never reach the customer. Socket stays open on failed/needs_attention. All PRODUCT.md gates apply.

## Direction contract

THESIS: The ticket is a real carbonless service form, and each pipeline stage stamps its ply onto it while the customer watches. It refuses the category default: a chat window with a pill and a progress bar on a dark neon ground.

OWN-WORLD: Forest-black carbon ground (#08130F, form ground #0B1511) with a green hero band; 1px hairline ruling; plies as flat fields (bone Received, mint Triaged, orange Drafted, deep green Replied, yellow for the live stage, grey-green for on hold); coral is reserved for urgent and errors. The Relay Full Demo is the authority for every value. Archivo Narrow caps for printed labels, Courier Prime for numbers, Public Sans for reading. No shadows, gradients, glow, radius flourishes or paper texture.

STORY: The customer sees at once that their request was received and where it is now, trusts the process because each step leaves a dated mark, reads the reply on its own ply, and can leave (email opt-in) or file another ticket. Failure reads as a calm "On hold" with a next step.

FIRST VIEWPORT: Top bar (ply-stack mark + Relay, Track field). Main 12-col grid: cols 1–9 the form. Its header row is printed caps "SERVICE TICKET · CUSTOMER COPY" with the subject at about 30px, and a ruled "No." cell on the right with the ref in Courier Prime. Under it a full-width ply row of four equal cells (stage number + caps label + printed time); the live one is yellow. Then the thread: the customer text on the white ply, right-aligned; the drafting/reply block below. Cols 10–12: the "Office use" column with category/priority as stamped boxes, per-stage times, and the email opt-in. Phone: the ply row plus the latest message fill the first screen; office use moves below.

FORM: Carbon Set (carbonless multi-part service ticket), candidate 3 of the first grounded list, palette superseded by the Relay Full Demo's green stock (2026-10-20); seed key 5f3e8504. Signature interaction: the ply stamp, a two-frame 90ms `steps(2)` change when a stage lands, with no easing (instant under reduced motion). Raises: phone first screen = active stage + latest message; one field owns the screen; hairline ruling; tabular figures.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

Exact AA-tuned token values (6.12). Final failure copy, checked against real alerting behaviour (6.13).
