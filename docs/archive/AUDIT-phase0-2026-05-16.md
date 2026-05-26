# Frederick Radius — Phase 0 Audit and Data Integrity Report

Date: 2026-05-16
Status: Phase 0 deliverable. No production code written. Checkpoint 1. Awaiting approval.
Voice: this document follows STYLE.md rules (complete sentences, no em dashes, direct).

---

## 0. Three findings that gate Phase 1 and beyond

The brief's working rules require surfacing scope drift, ambiguous calls, and missing keys. Three items must be decided before any further phase, because each changes the plan materially.

### 0.1 The canonical stack does not match the live codebase

The brief specifies Mapbox GL JS with a custom Mapbox Studio style, deck.gl for all data visualization, Supabase client and pgvector, a CMS (Sanity or Payload), Algolia or Typesense, and the Vercel AI SDK. None of these are in the repository.

| Brief canonical | Repository reality |
|---|---|
| Next.js 15 | Next.js 16.2.6 |
| Mapbox GL JS + Mapbox Studio style + deck.gl | MapLibre GL 5.24 + react-map-gl 8.1 + OpenFreeMap Positron tiles. No Mapbox. No deck.gl. |
| Supabase JS + pgvector | Drizzle ORM + postgres-js direct. No `@supabase/supabase-js`. No pgvector. |
| Sanity or Payload CMS | None. Editorial content is static TypeScript and JSON files. |
| Algolia or Typesense | None. Search is an in-memory index in `src/lib/search/index.ts`. |
| Vercel AI SDK, Voyage embeddings | None. |

This is not a small deviation. Phase 3 (custom Mapbox Studio style, terrain, 3D, deck.gl layers) and Phase 4 and 5 (Algolia/Typesense, AI SDK, pgvector) assume infrastructure that does not exist. Migrating the map vendor from MapLibre and OpenFreeMap (free) to Mapbox (paid, key required, custom Studio style is a separate manual workflow) is a strategic and cost decision, not an implementation detail. Decision required at Checkpoint 1. It belongs in DECISIONS.md once you rule on it.

### 0.2 Nothing built this session is deployed

Local `main` is 14 commits ahead of `origin/main`. None have been pushed. Production at frederickradius.app is running code from before this session. Six of the unpushed commits are the map rebuild that replaces the circle dots with category icon pins, plus the data audit, the events lineup, and the amenity icons. The product the brief asks to elevate is not running any recent work. Building more on top of an undeployed tree compounds the gap. This is a blocker, not a nuance.

### 0.3 Paid keys and accounts are required for most phases

Phases 3 through 7 depend on accounts and keys not present: Mapbox, PredictHQ, Algolia or Typesense, Stripe, Twilio, SafeGraph or Placer.ai, Cloudinary or Imgix, Geocodio, Google Civic Information, Open States, Eventbrite, Ticketmaster, Bandsintown. Per working rule 4, work stops and asks rather than guesses. A key inventory is in section 7.

---

## 1. Routing, data sources, and where the sources meet

Framework: Next.js 16 App Router, React 19, TypeScript, Tailwind 4. Host: Vercel. DB: Supabase Postgres via Drizzle and postgres-js.

Public routes under `src/app/(app)/`: `/` (Today home), `/map`, `/radius`, `/events`, `/events/calendar`, `/events/[slug]`, `/category/[slug]`, `/m/[municipality]`, `/places/[slug]`, `/plan`, `/pulse`, `/saved`, `/search`, `/trail`. Plus `/admin`, `/pitch`, `/submit/event`, `/submit/place`.

Server routes under `src/app/api/`: `travel-time`, `place-photo`, `place/[slug]/enrich`, `events/[slug]/ics`, `og`, and `ingest/{all,arcgis,celebrate,civicengage,county,dfp,seed}`.

Where the data layers meet:

- Places: a single in-memory array `PLACES` from `src/data/places.ts`. The file hand-defines 51 curated records (18 `seed`, 33 `manual`) and imports plus merges `src/data/places-dfp.json` (1,280 scraped records). Build-time Google enrichment lives in `src/data/places-enrichment.json` (51 entries) and is merged at request time by `applyEnrichment` in `src/lib/loaders/places.ts`. OSM is a separate live client (`src/lib/integrations/overpass.ts`) consumed only by the map, not merged into `PLACES`.
- Events: static `src/data/events.ts`, ingested CivicEngage rows in the `ingested_events` Postgres table read via raw SQL in `src/lib/loaders/ingested.ts`, live iCal in `src/lib/integrations/ical-live.ts`, and Hood College in `src/lib/integrations/hood.ts`. These are combined per surface, not pre-merged.
- The database schema (`src/lib/db/schema.ts`) defines only `civic_alerts`, `data_sources`, `radii`, `tags`. There is no places table and no events table. The brief and several phases assume a relational place and event store. That model does not exist.

## 2. How a single place record is composed at request time

1. `PLACES` is assembled once at module load: 51 curated objects, then `PLACES.push(...PLACES_DFP)` appends 1,280 scraped objects. Total 1,331.
2. A loader (`rankPlaces`, `placesWithinRadius`, `getPlaceBySlug`, `decoratePlace`) filters the array. `isOperational` drops records whose name is in the closures denylist (`src/lib/integrations/closures.ts`).
3. `applyEnrichment` looks up `places-enrichment.json` by slug. For the 51 enriched records it overlays Google `business_status`, hours, rating, photos, and maps Google phone and website onto the record. The other roughly 1,280 records get nothing at build time.
4. For unenriched records, the client route `GET /api/place/[slug]/enrich` fetches Google Places on first view and caches in the Next data cache for seven days.
5. There is no canonical place ID across sources. There is no `hours_source` or `hours_updated_at` field. Both are Phase 1 requirements and neither exists.

## 3. Duplication report

A conservative fuzzy pass ran across all 1,331 records: name normalization (lowercase, strip punctuation and apostrophes, drop the, and, llc, inc, co), Levenshtein similarity, and a 180 meter geo prefilter. Output: `audit/suspected-duplicates.csv` with similarity and distance columns sorted by score.

Result: 38 high-confidence pairs at name similarity 0.80 and within 180 meters. Zero matched on Google `place_id` because curated records almost entirely lack `place_id` (only 1 of 51 has one), so cross-source duplicates are caught by name and geo rather than ID.

This 38 is a floor, not the true count. The pass is word-order sensitive, so "Isabellas Taverna Tapas Bar" and "Isabellas Taverna and Tapas Bar" do not collapse. Named-business spot checks confirm the real figure is higher: Isabella's appears 3 times, Hootch and Banter 3, McClintock 3, Magoo's twice, plus a systemic curated-versus-DFP duplication pattern (Curious Iguana, North Market Pop Shop, and similar). Phase 1 needs token-set matching and a place_id backfill on curated records, not just edit distance.

## 4. Hours data coverage

| Source | Records with usable hours |
|---|---|
| Curated `places.ts` (`hours_verified: true`) | 3 |
| `places-enrichment.json` (`has_hours`) | 45 of 51 |
| DFP scrape (`places-dfp.json`) | 0 of 1,280 |

Static verified-hours coverage is roughly 48 of 1,331, about 3.6 percent. The on-demand enrichment route raises this for DFP records the first time each is viewed, then caches. There is no `hours_source` or `hours_updated_at` field, so the UI cannot show freshness and staleness cannot be measured. The "Open now" affordance is therefore unreliable across most of the dataset, which the Phase 1 60-percent gate is designed to address.

## 5. Copy quality audit

Method: rule-based classifier over all 1,280 DFP descriptions. A description is scraped if it repeats the venue name at the start, embeds an address or "Frederick, MD 2170x" string, contains emoji or social-scrape noise, or is shorter than 25 characters. Otherwise auto-clean.

Result: about 912 of 1,280 (71 percent) are scraped fragments. About 368 (29 percent) read as clean prose. The 51 curated descriptions are editorial and consistent. Across the visible dataset roughly 70 percent of records carry scraped copy.

Representative scraped patterns observed: name-repeat openers ("Dancing Bear Toys and Games Patrick St"), social-feed noise ("Here's his 2026 Wishlist: 1 Show up and do the thing"), and dangling fragments ending in an address. These are the patterns STYLE.md before-and-after pairs should target in Phase 1. Note: the codebase already enforces a no-em-dash, no-craft, no-soothing, team-not-staff voice in committed work this session, which aligns with the brief's editorial rules.

## 6. Performance audit

Honest limitation. I cannot produce trustworthy LCP, CLS, TTI, or Lighthouse numbers from this environment. There is no clean production build (the present `.next` is a 420 MB dev cache), no mid-range Android, no simulated 4G, and the local preview's WebGL map canvas renders intermittently for environmental reasons, which would corrupt any `/map` and `/radius` measurement. Reporting fabricated numbers would violate both the brief's quality bar and basic integrity.

What I can state structurally:

- The map is correctly code-split. `AppMapClient` loads `AppMap` via `next/dynamic` with `ssr: false`, so MapLibre and the OSM fetch are off the initial bundle for non-map routes.
- `/` (Today) renders many server components behind Suspense with shimmer fallbacks, which is the right pattern for LCP.
- The largest client weight is the map route (MapLibre 5.24 plus tiles plus an OSM Overpass fetch). `/radius` shares the map.
- `places-dfp.json` is 741 KB and `places-enrichment.json` is 253 KB. These are imported into the server bundle for `PLACES`. This is a real payload concern for any route that imports the loader and should be quantified.

Required to get real numbers: a clean `next build`, then Lighthouse CI or PageSpeed Insights against the deployed production URL on the specified device and network profile. This depends on finding 0.2 (deploy) first. Recommend wiring Vercel Speed Insights or Lighthouse CI as the durable measurement, since no performance observability exists today.

## 7. External APIs in use

Twenty-one integration modules in `src/lib/integrations/`: airnow, arcgis, closures, deeplinks, fcps, firstenergy, google-places, google-routes, hood, ical-live, mdot-chart, news, nps, nws, nws-alerts, overpass (OSM), planner, pulsepoint, reddit, seeclickfix, wikimedia. Plus OpenFreeMap tiles for the basemap.

Environment keys referenced in code: `GOOGLE_PLACES_API_KEY` (set, enrichment and photos work), `PULSEPOINT_AGENCY_ID` (unverified, the Pulse safety section stays hidden), `AIRNOW_API_KEY`, `NPS_API_KEY`, `FCPS_FEED_URL`, `HOOD_CALENDAR_URL`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_BASE_URL`.

Usage volume and cost cannot be reported from the codebase. There is no analytics, no Sentry, no PostHog, and no cost observability wired. Every integration uses graceful fallback (missing key means the feature hides, not breaks), so unset keys mean a feature is silently dark in production. INTEGRATIONS.md with rate limits, cost, and fallback behavior does not exist and is a Phase 1 documentation deliverable per working rule 6. Vercel cron runs `/api/ingest/all` daily at 09:00 and `/api/ingest/civicengage` daily at 08:00; whether these succeed on production is unverifiable from here.

## 8. Carryover defects that sit on the Phase 1 spine

- Event timezone bug, still present and unfixed. `src/data/events.ts:35` builds times with server-local `setHours`; `src/lib/integrations/ical-live.ts:167-168` treats TZID values as server-local. On the UTC production server, seed events and TZID feed events render four to five hours early. The render layer and the ingested CivicEngage path are correct and must not be touched. This is the highest-impact correctness defect and is squarely Phase 1.
- No canonical place ID, no `hours_source`, no `hours_updated_at`. Required by Phase 1, absent today.
- Duplicates unresolved (section 3).

## 9. Recommendation for Checkpoint 1

Approve Phase 0 and rule on the three section 0 items in this order:

1. Stack ruling. Keep MapLibre and OpenFreeMap, or fund and migrate to Mapbox plus deck.gl. This decides whether Phase 3 is a restyle or a re-platform. Record in DECISIONS.md.
2. Deploy. Decide whether to push the 14 commits so production reflects current work before more is built.
3. Provide or defer the paid keys in section 7 so phase scope can be set honestly.

Then Phase 1 (data quality foundation) proceeds: dedup pipeline, hours layer with source and freshness fields, the timezone fix, STYLE.md, and the copy-review tooling. No visual work in Phase 1, per the brief.

No production code was written. Deliverables: this file and `audit/suspected-duplicates.csv`.
