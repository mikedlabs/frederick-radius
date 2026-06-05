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
category pages (coffee) → events.** One clean step at a time — do NOT start
the next step until the current one is merged. UI hygiene was inserted before
coffee/events on purpose: every new surface built before it inherits the same
uncoordinated overlay/z-index problem (see "UI cleanliness" below).

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

### Pass 3 — category pages, starting with COFFEE (pattern page)
Goal: *stop making categories feel like directories; make them feel like
guided local choices.* Use **coffee** as the single pattern page — do NOT
build a giant category system yet. Surgical PR around:
- coffee briefing (a short editorial intro, not a count)
- best matches first
- open now
- local favorites
- good for sitting / work
- with food
- nearby
- full browse below (the directory, demoted under the guided sections)

### Pass 4 — events (the current biggest firehose)
Strong data, still reads as a feed. Needs: stricter grouping, capped
descriptions, civic calendar collapsed, and more human sections —
**Tonight / Weekend / Free / With kids / Live music.** Audit before building;
reuse existing event loaders/components, don't rebuild.

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
