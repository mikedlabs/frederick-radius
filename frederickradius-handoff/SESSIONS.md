# Sessions Runbook

One session per sitting. Each has a paste-ready prompt, a scope, and a gate. The gate is binary: pass and merge, or revert. Append every gate result to `docs/BASELINE.md` with the date.

---

## Session 0: Instrumentation

**Prompt:**
```
Read docs/04-missing-layers.md, Layer 0. Install posthog-js and wire exactly
these ten events with these names and no others: search_submitted, chip_tapped,
place_viewed, directions_tapped, save_tapped, plan_generated, plan_shuffled,
event_viewed, outbound_clicked, digest_subscribed. Enable session replay for
mobile. Do not change any UI. Show me each event firing in the PostHog debugger
before committing.
```
**Gate:** all ten events visible in PostHog from a real phone session.

---

## Session 1: Routes and navigation

**Prompt:**
```
Read docs/01-subtraction-brief.md sections 2 and 3, docs/05-site-capture.md,
and the locked decisions in CLAUDE.md. Execute the route work: 301 /radius to
/map, 301 /guide to /, 301 /pulse to /alerts (stub /alerts for now), make /
the Today surface per Decision 1, replace the Ask tab with Search per Decision 2,
remove the duplicate Events link from the utility nav, and render both tab bars
from one shared config object. Touch nothing else.
```
**Gate:** `npx playwright test tests/clutter.spec.ts` route and nav-404 tests pass; no other pages visually change.

---

## Session 2: Today subtraction

**Prompt:**
```
Read docs/01-subtraction-brief.md (kill, merge, demote rows naming /today),
docs/05-site-capture.md (/today inventory), and docs/02-pattern-spec.md P1
and P4. Rebuild /today as the time scrubber: one canvas, four segments, the
event hero rendered once, one weather sentence plus the forecast strip, the
conditional alert strip, category chips first, Worth a look as the editorial
module, and the plan as the P4 deck. Delete the stat card, the weather block,
both duplicate event modules, the standalone event row, and the explainer
paragraph. Demote the book promo to the footer.
```
**Gate:** budget.sh shows /today under 150 lines; duplicate-title and stat-card tests pass; personas 1 and 3 paths work by hand.

---

## Session 3: Events single system

**Prompt:**
```
Read docs/02-pattern-spec.md P3 and P5, docs/01-subtraction-brief.md (rows
naming /events), and docs/05-site-capture.md. Rebuild /events as the agenda
rail: one list grouped by day, the rail synced to scroll, five chips, one
Refine sheet, at most one pinned Tonight row, zero text inputs (search routes
to the P5 sheet). Every count on the page derives from the array rendering
the cards. Fix the inline RSC payload so decoded HTML lands under 300 KB.
```
**Gate:** count-integrity test passes; /events under 400 lines and under 300 KB; zero inputs in main.

---

## Session 4: Map, alerts, and the suite

**Prompt:**
```
Read docs/02-pattern-spec.md P2 and docs/01-subtraction-brief.md (map and
pulse rows). Implement the map sheet with three detents and pin-card sync
using vaul. Consolidate map controls to Use my location plus one layers
control. Build /alerts: the conditional strip logic on Today, empty
categories collapsed to one line, the census block deleted (move founded,
population, and municipalities to /about). Then run the full persona and
clutter suite and write the results to docs/BASELINE.md.
```
**Gate:** entire clutter.spec.ts green; budget.sh deltas recorded.

---

## Session 5: The signature layer

**Prompt:**
```
Read docs/03-signature-spec.md and open docs/reference/signature-layer.html
for the working implementations. Implement S1 through S4 exactly as specified:
the four Radius line roles, the three daypart token sets driven by sunset
time, the editorial image treatment with drone-library slots, and layoutId
plus View Transitions with the project spring. Respect every motion rule.
Nothing animates that the user did not cause.
```
**Gate:** clutter suite still green; reduced-motion verified; Mike approves feel on a real phone.

---

## Sessions 6 to 10: Growth layers

Run in order from `docs/04-missing-layers.md`: Session 6 the Thursday digest on Resend plus subscribe fields (gate: first real send). Session 7 JSON-LD Event and LocalBusiness schema, the robots.txt fix for answer engines, and the programmatic weekend page (gate: schema validates, page indexed). Session 8 nightly validation jobs and freshness badges (gate: zero dead event links for seven consecutive days). Session 9 magic link identity and persistent saves reusing the SwipeGrid auth pattern (gate: saves survive a device change). Session 10 PWA shell then conditional push (gate: installable, one real alert delivered).

---

## Standing instructions for every session

Work only the named scope. If something outside scope looks broken, write it to `docs/PARKING.md` and continue. End every session with budget.sh and the Playwright suite against the preview URL, append results to BASELINE.md, and stop for review before merge. Revert any session whose gate fails.
