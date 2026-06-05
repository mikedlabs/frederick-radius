# Backlog

Tracked, not urgent. Reviewed during the structure pass (June 2026).

## /radius — audited, mostly complete ✅
`/radius` already follows the structure-pass playbook: leads with the `WithinReach`
"best moves" strip, events are capped at top-5 with an "All N →" see-all, and the
full place list sits behind a "See everything" toggle (the count is demoted to a
secondary line, not the headline). **Do not rebuild it.** Small follow-ups only:

- [ ] Add **Transit** (nearest bus / MARC stop, with minutes) to the `WithinReach`
      reachable strip — currently missing because transit stops aren't in the
      `AmenityKind` set; needs transit-stop data plumbed into the inside-radius
      reach calc. Feature add, not a reorg.
- [ ] Optional later: small header/copy polish on the "Within reach" strip
      ("What you can reach from here") if it tests better. Cosmetic only.

## /map — structure pass 2/6 (PR #433) ✅
Ranked the in-view list as "Best in this view" (open now → feature_score →
nearest, top 6 + "See all N") and added a "Useful nearby" amenity section
(Events nearby → Useful nearby → Best places). Follow-ups:

- [ ] **Transit stays parked until the data exists — do NOT fake it.** Owner
      directive (June 2026): no placeholder/empty transit chip on the map or in
      `WithinReach`. `AMENITY_DISPLAY` is structured so a real transit kind
      surfaces automatically once transit-stop data lands; until then it stays
      absent, not stubbed.
- [ ] **Parking** is fine as-is: it's a place *category*, so it surfaces
      naturally in "Best places" / category filters. No need to model it as an
      amenity in "Useful nearby."

## Next structure-pass order
Owner directive (June 2026), updated: **#433 /map → UI hygiene foundation →
20-user simulation audit → category pages (coffee) → events.** One clean step
at a time — do NOT start the next step until the current one is merged. UI
hygiene was inserted before coffee/events on purpose: every new surface built
before it inherits the same uncoordinated overlay/z-index problem (see "UI
cleanliness" below). The simulation audit was inserted before coffee so we
see what we're missing **before** locking the next major page patterns.

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
- Local verification documented (same as other PRs while Actions is blocked).

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

### Pass 3 — category pages, starting with COFFEE (pattern page)
Goal: *stop making categories feel like directories; make them feel like
guided local choices.* Use **coffee** as the single pattern page — do NOT
build a giant category system yet. Decision facets **confirmed by the
simulation** (users 2/12/13 — directory feel is the proven gap):
- coffee briefing (a short editorial intro, not a count)
- best matches first
- open now
- local favorites
- good for sitting / work
- with food
- nearby
- full browse below (the directory, demoted under the guided sections)

**NEW RULE (owner, June 2026) — coffee is not "make the page nicer."**
Coffee must **prove the category system can rank from the user's context, not
downtown by default.** Today `/category/[slug]` ranks from the `fr_home_muni`
cookie but **silently falls back to `FREDERICK_CENTER`** when it's unset — so a
first-time Thurmont user gets downtown picks with no explanation. Coffee has to
demonstrate the fix:
- If a town/location is known → rank from it + show "Ranked from {town}".
- If NOT known → either **ask/set a town** inline, or be **transparent**:
  "Using Downtown Frederick as the default center." Never silently downtown-bias.
- This is the difference between a cleanup pass and a real product leap, and it
  makes coffee the pattern for context-aware ranking across ALL categories.
- Sev: **High** · Surfaces: category (all), feeds map/today/radius origin ·
  When: **during coffee** · Type: [G] (the fallback is in code) + [P].

### Pass 4 — events — AUDITED, MOSTLY COMPLETE ✅ (do NOT rebuild)
Audit (June 2026) verdict: the "firehose" label is **stale**. `/events` is
already tiered and trustworthy — the `/radius` outcome. Confirmed against the
code/data:
- ✅ Tiered + answer-first: Today (hero + "why it matters" + rail) → This
  weekend (grouped by vibe) → Later (collapsed) → Browse/Explorer (collapsed)
  → Civic (collapsed). First screen answers "tonight/this weekend?".
- ✅ Civic fully separated: `isCivicEvent` strips civic from the feed (0 civic
  in the upcoming set); municipal calendar is its own collapsed section.
- ✅ Descriptions capped: `line-clamp-2` everywhere + first-sentence "why it
  matters" ≤150 chars. No walls of text in browse.
- ✅ Recurring/low-relevance handled: `collapseRecurringEvents` folds weekly
  RRULE shows; non-event venue open-status entries dropped.
- ✅ Cancelled/stale: `deriveEventStatus` → red/amber badges + line-through;
  past events filtered out.
- ✅ Free / Family / Live music are data-backed (`is_free` + `category`), with
  one-tap chips already in the Explorer.
- ✅ Event detail intact + excellent: "Eat & drink before", "Parking nearby"
  (1.5km cap), same-venue future events, weather at start.

**Do NOT do an events structure pass.** Narrow real gaps only:
- [ ] **Feed reliability = the #1 "feels useful" lever, but it's DATA/OPS, not
      a UI pass.** `eventsLive` returns ~2; page leans on ~28 seed events
      because Hood is dead (HTTP 410) and Celebrate/County fail in the worker
      (issues #383–#423). Fix in the data cluster: repair Hood URL, Celebrate/
      County parser, owner-set Ticketmaster/Eventbrite keys. Sev: **High** ·
      Type: [G].
- [ ] **(Optional small polish) Lift the human lenses higher.** The Live music
      / Free / Family / Tonight / Weekend chips exist but sit inside the
      *collapsed* "Browse & search" Explorer. A compact intent row above the
      tiers, deep-linking the EXISTING lenses (reuse, ~1 component), would make
      the page answer by intent without expanding Browse. Sev: Med · Type: [P].
      Only if the owner wants it — not required.
- [ ] **Live-feed facet reliability (minor data note):** for live (not curated)
      events, `category`/`is_free` are keyword/default guesses; tighten as feeds
      recover so Free/Family/Live-music stay trustworthy. Sev: Low · Type: [G].
- [ ] **Downtown-defaulted** (24/28 upcoming are Frederick) — same county-wide
      posture as coffee; events are genuinely sparser in towns. Covered by the
      Cluster A posture work, not an events-specific fix.

---

## Simulation → tracked clusters (20-user audit, June 2026)
Full report: `docs/audits/2026-06-simulation-20-users.md`. Folded here as a
**small, sequenced** set — not 80 tickets. Each item: severity · surfaces ·
when · type ([G] code/data · [P] product judgment · [D] needs device QA).

**The sharper diagnosis (owner):** the real problem is **downtown posture +
data trust**, not just "coffee & events need cleanup." When the app lacks user
context it treats **downtown Frederick as the default center of gravity** — which
breaks the county-wide brand promise for Brunswick / Thurmont / Middletown /
Walkersville / Woodsboro. This cluster is tracked **alongside** coffee/events;
do NOT start implementing it yet unless it directly supports coffee (the
context-ranking rule above does).

### Cluster A — Downtown posture / county-wide default 🔴
The biggest hidden risk: claims county-wide, behaves downtown-first without
context. (Users 6,7,8,9,10,19 — 8 of 20.)
- [ ] Gentle **"set your town"** affordance when no location/home town exists.
      Sev: **High** · Surfaces: today, map, category, all · When: **starts in
      coffee** (context-ranking), broader rollout later · Type: [P].
- [ ] **Don't silently default to downtown.** Show "Ranked from {town}" or
      "Using Downtown Frederick as default" honestly. Sev: High · Surfaces:
      category, map · When: during coffee · Type: [G]+[P].
- [ ] Improve **no-location + cold-entry** states (map pinpoint-empty reads
      "blank"; ensure `/today` is the default entry, not `/map`/`/events`).
      Sev: High · Surfaces: map, today, events · When: later (not coffee) ·
      Type: [P]+[D].
- [ ] Make small towns **first-class starting points** (town discovery / index;
      precursor to GIS County View). Sev: High · Surfaces: town pages, nav ·
      When: later (GIS pilot) · Type: [P].

### Cluster B — Data trust / provenance 🔴
Trust leaks from data, not design. (Users 5,20 + cross-cutting.) **Audited June
2026 with live evidence — severities corrected below.**
- [ ] **Fix photo-twins — CONFIRMED High, do FIRST.** Authoritative `photo_names`
      check: **74 ChIJ clusters / 158 records (~10% of 1,540 photo'd places)**
      share a Google photo. Three causes: multi-tenant building photos
      (Brewer's Alley|Fountain Rock|Alley Wagon), wrong-photo on unrelated places
      (3 different Thurmont restaurants share one), and dup records (Rockwell ×2,
      Court St deck ×2). Surfaces: ALL place cards (today/map/radius/category/
      town/detail). Smallest safe fix: (a) fold true dupes in `places-dedup.json`;
      (b) deterministic shared-photo SUPPRESSION — keep the photo on one
      canonical record per ChIJ cluster, drop to category placeholder on the rest
      ("no photo" > "wrong photo"); (c) suppress junk records ("Best of Business
      Listings"). Type: **data + small pipeline rule** (no UI change). When: now.
- [ ] **Event feed cleanup — Medium (NOT the High outage previously assumed).**
      Live evidence: runtime `getLiveEvents(60)` = **77 events** (County 62,
      Celebrate 15); Celebrate + County HTTP 200 / valid. The page is well-fed.
      The daily-worker "not JSON" failures (#383+) are **false alarms** — those
      sources are iCal/RSS consumed at runtime, not JSON. Genuinely dead: **Hood
      (410)** + **DFP scrape URL (404)**, both contribute 0. Smallest safe fix:
      mark Celebrate/County runtime-only in `sources.yaml`/worker so they stop
      opening daily-failure issues; remove dead Hood + stale DFP scrape; (owner)
      set Ticketmaster/Eventbrite keys for additive coverage. Type: pipeline/
      config. When: after photo-twins.
- [ ] **Provenance on dense cards — Medium-low.** `SourceBadge`/`TrustChip`/
      `FreshnessChip`/`PlaceStatus`/`/trust` all exist; detail + lead cards carry
      trust, but `PlaceCard showSource` defaults OFF for row/tile/grid → map
      drawer, category sections, town lists show none. Optional: a compact source
      dot on dense cards. Lower value than fixing the wrong photos. Type: small
      code. When: after feeds / later polish.
- [x] **Municipality stamping — DONE (audited).** 1,649 places, **0 unstamped,
      0 off-bbox/needs-review**; every place valid + in-county. Downtown's 53.2%
      is real density (877), not a stamping error. No fix needed; GIS boundaries
      could refine edge cases later, but there's no leak. (Posture/downtown bias
      is Cluster A, a ranking matter — not a stamping one.)
- [ ] **De-emphasize weak/odd records** (feature-score-only ranking surfaces
      niche records — guitar studios/schools — over anchors). Sev: Med ·
      Surfaces: category, map, radius, today · When: during coffee (ranking) ·
      Type: [G]+[P].
- [ ] **Event feed reliability — the real "events" work (Sev: HIGH).** `/events`
      is audited & architecturally complete (see Pass 4); the actual problem is
      DATA/OPS: `eventsLive` returns ~2, so the page leans on ~28 seed events.
      Hood feed dead (HTTP 410), Celebrate + County failing in the worker
      (issues #383–#423). Repair Hood URL / Celebrate+County parser; track
      owner-set Ticketmaster/Eventbrite keys. This belongs to the data/pipeline
      cluster, NOT an events structure pass. Surfaces: events, town pages, today
      · Type: [G].
- [ ] **Live-feed facet confidence (Sev: Low):** for live (not curated) events,
      `category`/`is_free` are keyword/default guesses — keep documented, don't
      overstate in UI; improve as feeds recover. Type: [G].

### Optional — events intent-chip polish (DEFERRED, not trivial)
Audited verdict: NOT trivial, so skipped per owner's "skip if not trivial" bar.
Lifting Free/Family/Live-music chips above the fold would require force-opening
a localStorage-persisted collapsed Explorer + reconciling two param systems
(`lens` vs `cats`/`when`) — real dead-control risk. The lead tiers already
answer Tonight/Weekend. Revisit only if events gets a larger pass later. Sev:
Low · Type: [P].

### Cluster C — GIS pilot gating ⏸️ (do NOT implement yet)
Justified by the simulation; use GIS to solve **posture / orientation / trust**,
not as a layer dump. Full detail: `docs/GIS_FEASIBILITY.md` §4.
- County View **first** (top justified pilot — fixes the dominant small-town/
  orientation failure). · Type: [P].
- First Visit **second** (visitor sense-of-place). · Type: [P].
- Getting Around **third** (narrower; needs a live parking feed to matter). ·
  Type: [P].
- When: **after coffee + events**, gated on this audit (now satisfied).

### Cluster D — Device QA / future-proofing 🟡
- [ ] Confirm **post-#434 overlay behavior on a real device** (the z-index pass
      math is verified; on-device render isn't). Sev: Med · Surfaces: all
      overlays/map · When: anytime · Type: [D].
- [ ] Note the need for a **visual-regression / screenshot harness** later (no
      automated catch for stacking/overlap regressions today). Sev: Med ·
      When: later · Type: [P].
- [ ] Keep the **GitHub Actions runner block** visible as a process risk (CI
      trust rests on local runs until billing/runner is fixed). Sev: Med ·
      When: owner task · Type: [G].

---

## Pre-existing issues — tracked elsewhere, NOT yet scheduled
Carried over so the structure pass doesn't lose them. These are separate
from the page-by-page UI work above. Owner asked (June 2026) to make sure
none of these get forgotten.

### 🖼️ Wrong / shared photos on place cards (the "twins" issue)
User-reported: two cards showing the *same* thumbnail. Full audit in
`docs/audits/2026-05-27-dfp-photo-twins.md`; raw clusters in
`audit/photo-twins.json`. State: detector built, **15 true duplicates
folded** (May 27) — but **~37 clusters remain unresolved**:
- [ ] **22 MULTI_TENANT clusters** — different businesses sharing one
      building photo (e.g. 3 tenants at 112 E Patrick St). Records are
      correct; the shared photo is misleading. Fix = pick a distinct photo
      per record (upstream enrichment side). **This is the most visible
      "wrong photo on a card" symptom on /radius + /map.**
- [ ] **9 MAYBE_MULTI_TENANT_OR_DUPE** — need an editor to decide per
      cluster (some may be rebrands).
- [ ] **2 REVIEW + 1 WRONG_PHOTO** — genuine enrichment misapplications
      (same Google photo on unrelated records). Root cause: weak
      `resolveAndEnrich` matches cross-pollinating photos.
- [ ] Root-cause fix: add **photo-ChIJ extraction to the dedup pipeline**
      (same thumbnail = strong dup signal the name-Jaccard pass misses) and
      backfill real `ChIJ…` place IDs to replace the placeholder UUIDs.

### 🔁 Daily data-pipeline failures (open GitHub issues, automated)
7 sources fail the daily refresh (#383/#384/#387/#392/#397/#404/#423) and
show as stale (#74/#393): **mdot_chart, celebrate_frederick, hood_college
(HTTP 410), frederick_county_calendar, fcps_news (404), firstenergy_outages,
usgs_water (400).** Upstream feeds moved/closed or changed format. Triage per
`AGENTS.md` diagnose-failure; fix the source URL/parser or correct the
cadence in `data/sources.yaml`. NOTE: `celebrate_frederick` + `hood_college`
are the live event feeds — if they stay dead, /events coverage thins.

### 🧪 Stale prototype / mockup PRs to triage (open, not merged)
- [ ] **#422 `/reach`** — radius-as-gesture prototype.
- [ ] **#421 `/mock`** — premium-redesign mockups (predates the locked
      brand deck; likely superseded — confirm + close).
- [ ] **#420 `/fly`** — cinematic descent prototype.
- [ ] **#265** — Weinberg + Delaplaine event feeds, **inert** until
      `WEINBERG_CALENDAR_URL` / `DELAPLAINE_CALENDAR_URL` env vars point at
      real iCal URLs (venues don't expose one at the obvious paths).
      Decision: close, or chase the venues for a calendar URL.

### 📋 AUDIT.md half-working / broken (still open, see `AUDIT.md`)
- [ ] `/business/manage/[token]` — email-the-token flow not firing (no SMTP).
- [ ] `/business/claim` + `/submit/*` — write to DB but no review queue;
      untested end-to-end on prod.
- [ ] Inert event feeds: Ticketmaster, Bandsintown (need API keys + curation).
- [ ] Image perf: some raw `<img>` for Google photos (not `next/image`).
- [ ] `/places` directory index — the one surface not on the post-overhaul
      card system.
- [ ] Editorial routes (`/parks` `/trails` `/transit` `/water` `/history`)
      under-surfaced from the main pages — the "connectedness" phase.
- [ ] NOTE: `AUDIT.md` route names predate the structure pass (it lists
      `/now`/`/browse`; these are now `/today`/`/map`). Refresh when the
      structure pass lands.

---

### 🧹 UI cleanliness — overlap, overlays, "stuff on top of each other" (NOT done)
Owner asked (June 2026) whether the messy/overlapping UI is finally cleaned
up. Honest answer: **no — this is a known, still-open systemic workstream**,
separate from the page-by-page structure pass. Full diagnosis in
`docs/DESIGN_UX_AUDIT.md`. The structure pass (/today #432, /map #433) is that
doc's **Phase 3** (surface re-layout); the *root causes* of the mess are its
**Phase 0–1** (foundation + primitives), which are largely **not done**:

- [ ] **No central z-index scale → overlays can collide.** z-index is
      hand-picked per component with no shared ladder. Several independent
      floating elements sit at the **same `z-40`** with no coordination:
      `InstallPrompt`, `PullToRefresh`, `FloatingPlanFab`, `BottomDrawer`
      backdrop — plus a jumble above them (`PlaceSheet`/`Sheet`/`SearchOverlay`/
      `SortDropdown` at z-50, `PhotoLightbox` z-[120], skip-link z-[100]).
      Same-level + uncoordinated is exactly how things stack wrong. **Fix:**
      a named z-scale token set (nav / sheet / overlay / toast / modal) adopted
      everywhere.
- [ ] **`DESIGN_UX_AUDIT.md` §7 (map) 🔴 still open:** "Road & alerts overlay
      covers UI; overlay z-order needs a pass." Direct match for "stuff
      overlaid on top of each other" on the map.
- [ ] **Overlay/sheet primitive sprawl:** `Sheet` · `BottomDrawer` ·
      `CollapsibleSection` · the map in-view drawer are independent
      implementations that don't know about each other → inconsistent
      stacking, focus, and dismiss behavior. **Fix:** one shared sheet/overlay
      primitive (audit recommends Radix under the existing skin).
- [ ] **Token non-adoption (the root cause per the audit):** ~20 ad-hoc
      `text-[Npx]` sizes (1,000+ uses), 359 raw hex, inline `style={{}}` in
      ~214 files, 3 button / 3 sheet / 5 chip variants. This drift is *why*
      surfaces look inconsistent; lint guards + token-as-utilities stop it
      recurring.
- [ ] **Verification gap:** overlap/overlay bugs are **visual** — they need
      eyes on a real device (the sandbox can't render Mapbox/live overlays).
      No screenshot/visual-QA harness is wired yet, so these can't be
      regression-caught automatically. **Until then, "is it clean?" requires a
      device walk-through, not a green test.**

## 💡 Content & editorial ideas (owner notes — June 2026)
Brainstorm capture, not scheduled. "Things people might want to know" —
the texture that makes it a local field guide, not just a directory.

- [ ] **Major routes / roads.** Surface the big arteries people actually
      orient by: **I-270, US-15, I-70, US-340, US-40, MD-26, MD-355, MD-85.**
      Could be a map overlay (label the corridors), a "getting around"
      explainer, and/or live conditions. NOTE: there's already an
      `mdot_chart` traffic source wired (currently failing — see the
      data-pipeline issues above), so live road conditions are partly
      scaffolded. Cross-ref `/transit`.
- [ ] **County / city stats.** A "Frederick by the numbers" surface —
      population, towns, area, founding date, elevation, etc. Some of this
      already exists per-town (`/m/[slug]` shows population); idea is a
      consolidated almanac-style stat block for the county + City of
      Frederick.
- [ ] **Famous people from here.** Notable Fredericktonians (e.g. Francis
      Scott Key, Barbara Fritchie, Roger B. Taney) — an editorial "who's
      from Frederick" piece. Verify each before publishing.
- [ ] **Movies / TV shot here.** Productions filmed in Frederick County —
      another "did you know" editorial angle. Verify filming locations.
- [ ] Natural home for the above: the editorial routes (`/history`,
      `/about`, or a new "almanac"/"did you know" surface). Reuse the
      field-guide voice; keep facts sourced. Lower priority than the
      structure pass + data fixes — these are enrichment, not plumbing.
