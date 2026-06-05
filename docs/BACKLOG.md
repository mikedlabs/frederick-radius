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
Owner directive (June 2026): after /map (#433), do **category pages before
municipality pages**, then **events**. Category pages are the most likely to
read as raw directories, so they have the bigger "show all the data better"
problem. One clean step at a time — do NOT start the next page until the
current one is merged or tuned.

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
