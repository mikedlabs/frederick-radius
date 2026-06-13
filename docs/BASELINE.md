# Gate Record

Every session appends its `scripts/budget.sh` output and `clutter.spec.ts` result here with the date. This file is the progress record; the targets live in CLAUDE.md (/today under 150 lines and 150 KB; /events under 400 lines and 300 KB).

## Baseline, pre-Session 0 (June 12, 2026, 5:38 PM ET, production)

```
Clutter budget against https://frederickradius.app on Fri Jun 12 17:38:09 EDT 2026
page | visible lines | decoded bytes
-----|---------------|--------------
/ | 50 | 157179
/today | 304 | 322071
/events | 954 | 788892
/map | 19 | 126334
/alerts | 7 | 31314
```

Matches the June 12 capture in `frederickradius-handoff/docs/05-site-capture.md` within a few lines (/today 304 vs 310 captured; /events 954 vs 951). `/alerts` does not exist yet; its row measures the 404 page and becomes meaningful after Session 1 stubs the route.

## Gate, pre-Session 0 (June 12, 2026, production): 5 failed, 2 passed

Failures are expected at baseline; they are the work the sessions exist to do.

| Test | Result | First failing rule |
|---|---|---|
| clutter contract: / | pass | |
| clutter contract: /map | pass | |
| clutter contract: /today | FAIL | Rule 3, counts as content: body matches "places open" (the stat card) |
| clutter contract: /events | FAIL | Rule 4, one search system: text inputs render inside main |
| count integrity: /events | FAIL | Section "Today 1" claims 1 but renders 25 h3 elements |
| routes: twins are redirects | FAIL | /guide returns 200, not 301/308 (Decision 1 not yet executed; /radius and /pulse untested past first failure) |
| payload budgets | FAIL | /today decoded HTML 346,642 bytes, budget 150,000 (/events untested past first failure; budget run above shows 788,892 vs 300,000) |

Note on stability: across three runs the two page-contract tests flipped once (passed in one run minutes apart), so they are sensitive to time-of-day content on production. The other three failures were identical in every run. Fixes land in Sessions 1 (routes), 2 (/today), and 3 (/events).

## Session 0 (instrumentation), June 12, 2026, local production build of the rebased branch

A correction first: Session 0 was initially built on a local checkout nine days behind origin (June 3, before the ~160 merged PRs ending at #583). The branch was rebased onto the real main the same evening; one instrumented file had been deleted upstream (the duplicate cmdk palette, retired by #577 — the SearchOverlay, already instrumented, is the one Cmd+K system), and the remaining hooks re-verified firing against the current components. The numbers below are from a production build of the REBASED tree on port 3100 (Vercel previews are auth-protected; see docs/PARKING.md item 4).

```
Clutter budget against http://localhost:3100 on Fri Jun 12, evening
page | visible lines | decoded bytes
-----|---------------|--------------
/ | 42 | 88130
/today | 349 | 357243
/events | 964 | 1350214
/map | 127 | 158200
/alerts | 7 | 28223
```

Clutter suite against the same build: 5 failed, 2 passed — the same failure shape as the production baseline (stat card on /today, inputs in /events main, count integrity, twin redirects, payload budgets), which is the expected pre-subtraction state and confirms the rebase landed on the code production actually runs. Session 0 changes no UI by design: the PostHog provider renders null and every capture rides an existing handler.

Session 0 gate status: all ten events wired on the current main; chip_tapped, place_viewed, directions_tapped, save_tapped, and search_submitted re-verified firing after the rebase (plan, event, outbound hooks merged without conflict and were verified pre-rebase; digest_subscribed has no UI surface until Session 6). The PostHog-debugger-from-a-real-phone gate is blocked on creating the PostHog project and setting NEXT_PUBLIC_POSTHOG_KEY in Vercel; the wiring is inert until then by design.

## Session 1 (routes and navigation), June 12, 2026, local production build

Route work landed: / is the Today surface (Decision 1); /guide, /today, and /pulse permanently redirect (to /, /, and the new /alerts stub); /radius already redirected on main. The tab bar is Today, Events, Map, Search, Saved from the one shared config (Decision 2); Search is an action slot opening the one command sheet; the duplicate Events link left the utility footer.

```
Clutter budget, local production build, Fri Jun 12 evening
page | visible lines | decoded bytes
-----|---------------|--------------
/ | 377 | 352662
/today | 377 | 352662  (308 redirect to /, measured after following)
/events | 919 | 735324
/map | 19 | 119613
/alerts | 18 | 54540
```

The / row now measures the Today surface, so it jumps from the old 50-line funnel to Today's count by definition; Session 2 subtracts it toward the under-150 target. /today is a permanent redirect, so its row now mirrors /.

Clutter suite: 6 passed, 1 failed. PASSING now includes the Session 1 gate (routes: twins are redirects) plus every nav-404 check, the /events and /map contracts, and count integrity on this run. The one failure is the /today payload budget (decoded HTML over 150 KB), which is Session 2's named work. The / and /today page contracts pass or fail with the time-of-day stat card, as documented at baseline; the stat card itself is on Session 2's kill list.

Gate verdict: PASS (route and nav-404 tests green; remaining pages verified visually unchanged; the tab bar change is the named scope).

## Session 2 (Today subtraction), June 13, 2026, local production build

The root (Today) was rebuilt from a stacked dashboard into the P1 time
scrubber: one canvas, the four-segment When? control (counts in the
segments, derived from the same arrays that render the windows), the
event hero rendered exactly once, one weather sentence (TodayCard mood
line) plus a one-line forecast strip (ForecastLine — the site-capture
inventory's "94°→71°, storms 3–8 PM", replacing the 33-line 7-day
NowDayStrip), the conditional alert strip, category chips first, Worth
a look as the one editorial module (trimmed 6→4), and the plan as the
P4 horizontal snap deck (MoveStack → new PlanDeck). Deleted: the
"<N> places open" stat card (→ a single "What's open near you" action
row to /map?mode=browse&open=now), the full weather block (hourly /
7-day / more-details), the duplicate event answer cards + TodayMoves,
the ParkMobile/OpenTable explainer paragraph, the local-news rail, and
the first-visit beta strip. The drone-book promo demoted to <footer>.

Per-window budget (production build on :3100), all four reachable in one tap:

```
window      visible lines   decoded bytes
?t=now      97              143,024   (under 150 lines / 150 KB)
?t=tonight  107             147,479
?t=tomorrow 107             147,530
?t=weekend  105             145,735
```

Root /today baseline was 310 lines / 326 KB; the rebuilt surface is
~100 lines / ~145 KB — under both the 150-line and 150-KB targets, with
the event shelf capped at 2 tiles so a busy window can't blow the byte
budget.

Clutter suite: 6 passed, 1 failed. The four clutter contracts (zero
stat cards, zero duplicate titles, zero stray inputs, no nav-404),
count-integrity, and the twin-redirect test all pass. The ONE failure
is the payload-budget test on /events (776 KB vs 300 KB) — Session 3's
RSC-payload work, out of Session 2 scope. /today's own payload passes
at ~142 KB.

Personas by hand (Session 2 gate): Persona 1 (Saturday visitor) —
"What's open near you" is the first tappable content answer (NOT a
count) → /map?mode=browse&open=now → place → Directions, ≤3 taps.
Persona 3 (date-night local) — Tonight segment → the event hero,
rendered exactly once (verified: zero events render twice on the
screen) → event page → reserve.

Gate verdict: PASS (/today under 150 lines; duplicate-title and
stat-card tests green; personas 1 and 3 walk by hand). The /events
payload failure is Session 3's named work.

## Session 3 (Events single system), June 13, 2026, local production build

/events rebuilt from two stacked systems (an editorial "best of" layer +
a full client browse explorer) into the P3 agenda rail: ONE server-
rendered list grouped by Eastern day, a pinned scroll-synced date rail
(client island fed day metadata only), five mood chips (All / Music /
Family / Civic / Free) filtering via URL params, one Refine sheet
(town + sort, toggles only — zero inputs), and the single pinned
"Tonight" row as today's relabeled day-group. EventsExplorer + its
full-event-array client prop (the 776 KB driver), both search inputs,
the four view modes, EventsMap, WeekendVibes, TonightRail,
EventWeekRibbon, and the MunicipalEvents module (which carried the
second search input) are gone from the page.

THE PAYLOAD FIX: the event objects no longer cross into a client
component. The list is server-rendered; filtering is URL-param driven;
the only client islands (EventDayRail, EventRefine) receive day
metadata and the towns list, never events. The agenda is capped to
whole day-groups up to 32 events, with overflow to the Month calendar
(the complete list lives there).

Budget across filter states (production build on :3100):

```
state             visible lines   decoded bytes   (target <400 / <300KB)
/events (all)     223             275,049
?mood=music       295             287,626
?mood=free        96              129,718
?mood=civic       85              132,420
?sort=az          233             262,989
?m=frederick      224             273,440
```

Was 951 lines / 776 KB. Every state is under both budgets.

CLUTTER SUITE: 7 passed, 0 failed — the FULL suite is green for the
first time since the 5-failure baseline. The /events payload test
(776 KB → under 300 KB), count-integrity, the four clutter contracts
(zero inputs incl. the Refine sheet, zero stat cards, zero duplicate
titles, no nav-404), and twin-redirects all pass.

Personas by hand (Session 3 gate): Persona 2 (parent) — the Family
chip filters the one source array; chip counts are navigation, and
count-integrity (h2 number == h3 cards) passes, so no label disagrees
with its list. Persona 5 (civic) — the Civic chip surfaces only
meetings (Council Legislative Meeting, Planning Commission, …) with
zero facility-rental/non-event leakage; the Planning Commission is the
second result.

Gate verdict: PASS (count-integrity green; /events under 400 lines and
under 300 KB across all states; zero inputs in main; personas 2 and 5
walk by hand). Orphaned event components (EventsExplorer, EventsMap,
WeekendVibes, TonightRail, EventWeekRibbon, EventAgenda,
EventsCompartmented, MunicipalEvents) are now unmounted — a later
cleanup should delete the zero-caller ones.
