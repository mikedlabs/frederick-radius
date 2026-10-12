> Superseded. Current: CLAUDE.md, docs/VISUAL_FIRST.md and the open items in docs/BACKLOG.md. History, not instructions.

# Backlog sections shipped in June 2026

These sections moved out of `docs/BACKLOG.md` on 2026-10-08 because their
work shipped. They are kept as the record of what was decided and built.
The "do AFTER" and "BEFORE" sequencing in the Pass 2.5 and Pass 2.75 headings
is moot now that both passes shipped (#434 and
`docs/audits/2026-06-simulation-20-users.md`). The current build order is in
`docs/VISUAL_FIRST.md`.

## ✅ Trust polish shipped (2026-06)
Frederick Radius now has an **editorial standard. That is the brand.** The site
doesn't show everything first — it shows the *right* thing first, and it never
acts certain when the data is only approximate. Shipped:

- **Recommendation eligibility (#436/#437).** Institutions, schools, and junk
  listings stop leading "things to do." `belongs-to-feed ≠ should-be-promoted`
  — the disease the whole standard is named after.
- **Event eligibility / lanes (#443).** `/events` "What's on" is public events
  only. Civic meetings + town reminders get their own collapsed lanes; private
  rentals + cancelled items are suppressed. Title-only, conservative, validated
  against the live feed (zero real events mislaned).
- **News relevance gate (#438).** Today's rail is Frederick-relevant only — no
  statewide/Montgomery leakage.
- **Why-this-result reasons (#439).** Promoted cards say *why* (kid-friendly,
  free, near a landmark, matches intent), capped at 3 — confidence you can read.
- **Entity decode (#441).** `cleanFeedText` named-entity map + residual guard —
  `&bull;`/`C&amp;O` never reach the reader (and `C&O`/`AT&T` stay intact).
- **Photo de-twin (#442).** PhotoMosaic walks the pool sequentially — no more
  "Looks like Family → Spinners ×6"; every tile is a distinct place.
- **SEO indexing (#440).** Per-route self-canonicals (no more homepage-canonical
  collapse) + a redirect-free, data-driven sitemap.

### Pass 2.5 — UI HYGIENE foundation (do AFTER #433 merges, BEFORE coffee)
A **foundation pass, not a beauty pass.** Owner scope (June 2026): stop every
floating thing from fighting for the top of the screen. **Do NOT turn this into
a design-system rewrite** — no restyling the whole app, no rebuilding every
primitive. Scope is strictly the overlay/stacking class of bugs.

Scope:
- [ ] Create a **named z-index scale** (tokens), e.g. base content < sticky
      nav < floating buttons (FAB) < drawers < dropdowns < search overlay <
      modals/sheets < toast/install/pull-to-refresh < lightbox < skip link.
      (Exact ordering to be finalized in the pass; the point is one owner per
      layer.)
- [ ] Replace ad-hoc z-index values **where they affect overlays/floating UI**
      (leave unrelated local z-10s alone — don't churn the whole app).
- [ ] Make these stop competing blindly: `BottomDrawer`, `Sheet`,
      `SearchOverlay`, `PlaceSheet`, `SortDropdown`, `InstallPrompt`,
      `PullToRefresh`, `FloatingPlanFab`.
- [ ] Fix the **map overlay collision** (`DESIGN_UX_AUDIT.md` §7): road/alert
      overlays covering primary controls/drawers.
- [ ] Add a **short doc** (the layer scale) so future components don't invent
      their own z-index.
- [ ] Add a **lightweight lint/check if practical** so random `z-[999]` / new
      ad-hoc overlay values can't creep back in.

Acceptance criteria:
- No two unrelated floating systems sit at the same z-index by accident.
- Map overlays do not cover primary controls/drawers.
- Search, sheets, dropdowns, lightbox, FABs, install prompt, pull-to-refresh
  all have predictable stacking.
- Mobile review shows no obvious overlap/collision.
- The pass does NOT restyle the whole app or rebuild every primitive.
- Local verification documented (same as other PRs while Actions is blocked). LIFTED by 2026-08-19: CI verify and style-lint run and are required on main (CLAUDE.md, "Verification norms").

### Pass 2.75 — 20-USER SIMULATION AUDIT (do AFTER hygiene, BEFORE coffee)
A pressure-test, not happy-path theater. Owner directive (June 2026):
simulate 20 different user types across Frederick County trying to **break,
misunderstand, stress, and distrust** the app — to expose flaws, leaks,
confusing flows, weak/stale data, crowding/overlap, and anything that makes it
feel like a directory instead of "the county finally has an interface."

**Standard:** Frederick Radius should not feel like a directory. It should
feel like the county finally has an interface.

**Critical instruction:** half the value is from BORING, PRACTICAL, FRUSTRATED
users — parking, bathrooms, civic info, no location permission, bad weather,
smaller towns, stale business listings. That's where trust is built or lost.
Do NOT only simulate users who want fun things.

**The 20 user types:**
1. Downtown Frederick visitor with 2 hours
2. Longtime resident who hates tourist fluff
3. Parent with young kids
4. Older / low-tech user
5. Business owner checking their listing
6. New resident understanding the county
7. Brunswick user
8. Thurmont / northern county user
9. Middletown / Myersville / western county user
10. Walkersville / Woodsboro user
11. Weekend visitor from DC or Baltimore
12. Rainy-day user
13. User looking for something free
14. User looking for dinner before an event
15. User trying to find parking quickly
16. User looking for restrooms / practical needs
17. Civic/practical user looking for municipal info
18. User who only gives the app 30 seconds
19. User WITHOUT location permission enabled
20. User who distrusts the data — wants to know what's official, curated,
    owner-submitted, or feed-based

**Per-user documentation (all 17 fields):** 1 starting town/location · 2 user
type · 3 mission · 4 expected fastest path · 5 actual path · 6 tap count /
scroll depth · 7 what worked · 8 what felt confusing · 9 where UI felt
crowded/overlapped · 10 any drawer/sheet/nav/prompt/map-control collision ·
11 any incorrect/stale/weak/duplicate/suspicious data · 12 any missing
source/freshness/trust signal · 13 downtown-biased vs county-wide · 14 clear
next action? · 15 felt modern/fun/fresh/worth returning? · 16 severity
(Critical/High/Medium/Low) · 17 recommended fix type (quick copy / UI-layout /
data-ranking / component-system / larger product change).

**Group findings three ways:** (1) by user type; (2) by app surface — Today,
Map, Radius, Search/Ask Radius, Category pages, Events, Town pages, Place
detail, Event detail; (3) by severity.

**Must pressure-test specifically:**
- Does the app answer quickly, or make users browse?
- Are categories helping people decide, or just filtering data?
- Do events feel useful, or like a firehose?
- Does the map explain the area, or just show pins?
- Are source/freshness signals strong enough?
- Are small towns treated seriously (not downtown-biased)?
- Does the app work without location access?
- Are practical needs (parking/restrooms/civic) easy to find?
- Are open-now and worth-your-time results trustworthy?
- Are weak records promoted too high?
- Does anything visually overlap or fight for attention?

**Not just bugs — product insight.** Find: what's hard to use, what creates
doubt, what feels like a database, what feels repetitive, what feels visually
messy, what makes data seem wrong even if technically correct, what feels
fresh and worth building on, what could make this a one-of-a-kind county
experience.

**Output must END with six top-10 lists:** (1) top 10 product problems ·
(2) top 10 quick wins · (3) top 10 data-trust fixes · (4) top 10 UI/UX fixes ·
(5) top 10 future-proofing risks · (6) top 10 ideas that make it more fun,
modern, fresh, and one-of-one.

NOTE on honesty: a simulated walk-through is reasoning over the real code +
data, NOT a live device session — it can't validate drag-feel/render. Flag
which findings are code/data-grounded vs would-need-a-device to confirm.

**Also pressure-test the GIS hypotheses** (so a GIS pilot has to *earn* its
place — see `docs/GIS_FEASIBILITY.md` §4). The simulation must explicitly answer:
- Do smaller towns feel shortchanged? (→ would justify **County View**)
- Do visitors need better orientation? (→ County View / First Visit)
- Do people need parking / road context? (→ Getting Around)
- Does the map feel generic? (→ all GIS modes)
- Does county-wide context help users understand where they are? (→ County View)
If confirmed, GIS becomes a targeted product answer; if not, the pilot waits.
