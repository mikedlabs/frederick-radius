# Phase 1 build plan

Plan-first per working rule 3. Every piece is additive and flag-gated.
Flags default off, so flags-off equals today's production. That is the
rollback path the brief requires.

Reality the plan must respect (from AUDIT.md): places are static files
(`src/data/places.ts` plus `places-dfp.json`), merged in memory. There
is no places table. The DB holds only civic_alerts, data_sources,
radii, tags, ingested_events. So persistence here is committed JSON
artifacts, which is how places and enrichment already work. No
destructive schema change. No new DB table unless a later phase needs
one.

## 1. Deduplication pipeline

- `scripts/dedup.ts`: load `PLACES`, fuzzy match on normalized name plus
  Levenshtein plus geo distance under 180 m plus address token overlap.
  Canonical winner by source priority manual then seed then dfp, then
  the record with a google_place_id, then first seen. The canonical
  absorbs unique website, phone, and opening_hours from its duplicates.
- Output additive artifacts: `src/data/places-dedup.json`
  (slug to { canonical, merged }) and `src/data/dedup-candidates.json`
  (scored pairs for review).
- Loader change in `src/lib/loaders/places.ts`: when `RADIUS_DEDUPE` is
  on, drop non-canonical slugs and overlay merged fields. Default off.
- `/admin/dedup-review`: lists candidates at or above a configurable
  threshold with accept and reject. Decisions persist to
  `src/data/dedup-decisions.json`, which `scripts/dedup.ts` honors on
  the next run. Built in two units: the script and flagged filter
  first, then the review route and write-back.
- Acceptance: with the flag on, Isabella's, Hootch and Banter,
  McClintock, Magoo's, Curious Iguana, North Market Pop Shop each
  collapse to one canonical. With the flag off, counts are unchanged.
  A test asserts both.

## 2. Hours layer and freshness

- Add optional `hours_source` ("google_places" | "osm" |
  "manual_override") and `hours_updated_at` to the place type. Additive.
- Precedence at compose time: Google enrichment, then parsed OSM
  `opening_hours`, then curated manual hours. `applyEnrichment` stamps
  source and timestamp from the enrichment record.
- New `src/lib/hours-osm.ts` parses the common OSM `opening_hours`
  grammar subset. Out-of-grammar values are ignored, not guessed.
- Coverage gate: a helper computes the verified-hours ratio for a set
  of places. The "Open now" affordance hides when the visible ratio is
  under 60 percent, with one STYLE.md-compliant sentence explaining why.
  Flag `HOURS_GATE`, default off.
- Acceptance: report verified-hours coverage by source at Checkpoint 2.

## 3. Copy quality

- `src/lib/copy-quality.ts`: pure `classifyDescription` implementing the
  STYLE.md detector rules, returning "reviewed" | "auto_clean" |
  "scraped". Unit tested against fixture strings.
- `scripts/copy-scores.ts` writes `src/data/copy-scores.json`.
- `/admin/copy-review`: worst-first list with an inline editor that
  enforces the STYLE.md rules before save. Edits persist to
  `src/data/copy-overrides.json`, which the loader overlays.
- Acceptance: report the curated, auto_clean, scraped split at
  Checkpoint 2.

## 4. Nightly job and data health

- `src/app/api/cron/data-health/route.ts`: re-run dedup and copy
  scoring, refresh Google hours for the top 500 by feature_score.
  Google refresh is real API cost and is gated by an env flag and
  documented in INTEGRATIONS.md with the rate limit and fallback.
- `/admin/data-health`: reads the latest artifact numbers. Read-only.
- Vercel cron entry added to `vercel.json`.

## Sequencing

Dedup script and flagged filter and test first. Then hours fields and
precedence and the gate. Then the copy detector and scores. Then the
three admin routes. Then the nightly job and `INTEGRATIONS.md`. Stop at
Checkpoint 2 and report dedup, hours, and copy numbers. Do not deploy
without an explicit instruction.
