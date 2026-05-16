# Frederick Radius Full Data Audit

Date: 2026-05-15
Scope: Read-only audit of all data in the app: places, events, civic and live
feeds, the database, configuration, and reference datasets. No code changed.
Supersedes the narrower Phase 0 audit for breadth; Phase 0's five findings are
re-checked here and their current status is reported.

---

## 0. Headline finding

The event timezone bug identified in Phase 0 is still present and unfixed.

- `src/data/events.ts:35` builds times with `d.setHours(hour, minute, 0, 0)`,
  which uses the server local timezone.
- `src/lib/integrations/ical-live.ts:167-168` still treats `TZID` values as
  server local ("close enough for display").

On the UTC production server this renders static seed events and every
TZID-bearing live-feed event four to five hours earlier than reality. It looks
correct in local development because the dev machine is on Eastern time. This
is the single biggest credibility problem on the live site, and it has not been
addressed because work this session went to the map and UI instead. Nothing
else in this audit outranks it.

---

## 1. Where the data lives

- Static files under `src/data/`: places, events, categories, municipalities,
  tags, beverage trail, and several reference datasets.
- Supabase Postgres via Drizzle. `schema.ts` defines four tables only:
  `civic_alerts`, `data_sources`, `radii`, `tags`. Event ingestion tables
  (`ingested_events`, etc.) come from `drizzle/0001_event_ingestion.sql` and
  are read with raw SQL via `getSql()`, not through `schema.ts`.
- Vercel cron is configured (`vercel.json`): `/api/ingest/all` daily at 09:00
  and `/api/ingest/civicengage` daily at 08:00. Whether these are succeeding
  on production and actually populating `ingested_events` cannot be verified
  from the codebase. It needs a production check.

## 2. Places

- Total in the rendered array: 1,331 (18 `seed`, 33 `manual`, 1,280 `dfp`).
- Google `place_id` coverage: 1,237 of 1,331 (93 percent).
- Field coverage on the merged set: phone 681 (51 percent), website 1,072
  (81 percent), structured `hours` 3, `hours_verified` 3.
- Build-time enrichment (`places-enrichment.json`): 51 entries, 45 with hours,
  50 with photos, 50 with phone, 1 marked permanently closed.
- On-demand enrichment route exists, so DFP places fill photos, hours, phone,
  and rating the first time they are viewed, then cache. At render time before
  any views, verified-hours coverage is still roughly 48 of 1,331, about 3.6
  percent.
- Food trucks: the category exists and is anchored to 3 real host venues
  (Monocacy, Rockwell, Smoketown). No standalone truck records, by design.
- Closures denylist is active, so known-closed businesses (VOLT, Idiom, Ayse,
  Firestone's, and similar) are filtered app-wide.

Duplicates (Phase 0 Issue 1, unfixed): still present. Isabella's appears 3
times (manual plus two DFP), Hootch and Banter 3 times, McClintock 3 times
(all DFP variants), Magoo's twice. No dedupe was performed. The dominant
pattern remains a curated record plus its DFP scrape, plus DFP name variants.

## 3. Events

- Static `src/data/events.ts`: 43 events (23 `dfp`, 5 `celebrate`, 15
  `manual`), 28 recurring.
- Ingested CivicEngage events read from the `ingested_events` table via
  `src/lib/loaders/ingested.ts` (ISR cached). Populated by the daily cron if
  it is running on production.
- Live iCal via `ical-live.ts` (Downtown Frederick Partnership, Celebrate,
  County) and Hood via `hood.ts`.
- Timezone: broken for static seed and TZID live-feed events (see section 0).
  The ingested CivicEngage path uses correct UTC conversion and should not be
  touched. The render layer is correct; the defect is at time construction.

Category leak (Phase 0 Issue 4, unfixed): `ingested.ts:101` passes the raw
`head.category` straight through, and `SeriesCard.tsx:63` renders
`{series.category}` verbatim. Raw county taxonomy ("Workforce Services" and
similar) can still surface where a catid is not in the per-source
`category_map`. The static and live iCal category paths are clean.

## 4. Civic and live integrations

Twenty-one integration modules exist: airnow, arcgis, closures, deeplinks,
fcps, firestone (closures), firstenergy, google-places, google-routes, hood,
ical-live, mdot-chart, news, nps, nws, nws-alerts, overpass (OSM), planner,
pulsepoint, reddit, seeclickfix, wikimedia.

Environment-gated. Each degrades gracefully (feature hides when its key or
URL is unset), so the risk is silent absence on production, not breakage.
Keys referenced in code: `GOOGLE_PLACES_API_KEY` (enrichment and photos work,
so this is set), `PULSEPOINT_AGENCY_ID` (unverified, the Pulse safety section
stays hidden until a valid Frederick County agency id is set),
`AIRNOW_API_KEY`, `NPS_API_KEY`, `FCPS_FEED_URL`, `HOOD_CALENDAR_URL`,
`ANTHROPIC_API_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_BASE_URL`. Which of these are
actually set in the Vercel production environment cannot be determined from
the codebase and should be checked. Any unset key means that feed is dark on
the live site even though the code is present.

## 5. Reference and marketing datasets

`beverage-trail.ts`, `municipalities.ts`, `tags.ts`, `categories.ts`,
`frederick-data.ts` (market stats), `city-data-engine.ts` (demographics),
`live-data-engine.ts` (craft beverage trail) are static curated reference
data. They are stable and low-risk but are point-in-time snapshots with no
freshness tracking, so figures can drift from reality over time.

## 6. Description quality (Phase 0 Issue 5, unfixed)

DFP descriptions: heuristic classification puts roughly 912 of 1,280 (71
percent) as scraped fragments (name-repeat, embedded addresses, social-scrape
noise, very short). Curated descriptions read as editorial. No classifier or
truncation was added. This remains the dominant content-quality issue and is
unchanged from Phase 0.

## 7. Status of the Phase 0 five issues

1. Place dedupe: unfixed. Duplicates confirmed still present.
2. Event timezone: unfixed. Root cause still in code (section 0).
3. Hours pipeline: partially mitigated by the on-demand enrichment built this
   session, but static render coverage is still about 3.6 percent and there is
   no `hours_verified_at` staleness field.
4. Category remap: unfixed. Raw passthrough still renders verbatim.
5. Description quality: unfixed. About 71 percent fragments.

The reason none of the five are resolved: after Phase 0 the work was redirected
to the map, the Live Pulse dashboard, PulsePoint, food trucks, the featured
events hero, and the map visual and control overhaul. Those shipped. The
credibility fixes did not.

## 8. What cannot be verified from here

- Whether the daily ingest crons are succeeding on production and
  `ingested_events` is populated.
- Which environment variables are actually set in Vercel production.
- The live-site rendered state (the local preview's WebGL map canvas has been
  intermittently blank for environmental reasons unrelated to code).

These three need a production-side check.

## 9. Recommendation

Order by user impact, not by effort:

1. Fix the timezone bug. It is small, it is the worst credibility problem, and
   it is well understood. Construct seed times in Eastern explicitly and stop
   treating `ical-live` TZID values as local. Add a regression test.
2. Confirm production environment variables and that the ingest crons are
   actually running and populating events.
3. Dedupe places (cross-source curated-versus-DFP plus DFP name variants).
4. Truncate or down-rank scraped-fragment descriptions.
5. Translate ingested categories at the render boundary.

Nothing here required a code change. This file is the only output.
