# Data Audit — July 2026

Three-part audit of the data layer: the complete source inventory, the
quality/gaps report, and an externally-verified scout of NEW Frederick-specific
sources. Read like MAP_AUDIT.md / EXPERIENCE_REVIEW.md: a working document.

> **Status update, 2026-07-27:** This document preserves the July 2 audit
> snapshot below. Since then, hours freshness is strict by default, stale
> schedules are withheld from open-now claims, and the rolling refresh persists
> to `place_hours_refresh`. The current public snapshot has 159 of 1,613 places
> with a current publishable schedule; the source artifact carries 167 fresh
> schedules for 1,524 Google-backed places. Open Now remains unavailable until
> the reviewed public set reaches its 60% gate (968 places). Event adapters now
> report failed and partial sources instead of turning every outage into an
> empty result. Downtown Frederick events use the public Vibemap WordPress
> endpoint. The remaining hours work is completing the rolling paid cycle and
> merging its reviewed data PRs.

## The synthesis

Frederick Radius has an unusually RICH acquisition layer (60+ sources) and a
weak MAINTENANCE layer. The pattern across every finding: data enters well and
then rots silently — snapshots with no refresh (venue-events: 100% expired),
verifications that age out together (everything says 2026-06), report-only
crons that detect problems nobody sees (business-status finds permanently
closed places daily and persists nothing), and switches left off
(SAVED_REMINDERS_ENABLED, amenity enrichment never run).

### Fix-first (the rot)
1. Re-run venue-events ingest + put it on a cron (source contributes ZERO today).
2. Run `enrich:amenities` + `build:client-places` (owner: Google key) — facets
   light up across ~1,700 places with no code change.
3. Pull the hours-refresh cycle + flip enforcement (all hours verified May).
4. Extend /admin/data-health to ASSERT: venue snapshot has future events ·
   hours refreshed < N days · count of stale `last_verified` · `sources_failed`
   from live feeds. Every P0 would have been a red line instead of a blank.
5. Editorial pass on the 616 generic blurbs, top-150 by feature_score first.
6. Vercel switches: SAVED_REMINDERS_ENABLED=1 · Ask AI key · KV vars.

### Add-next (the one-of-a-kind layer, all verified to exist)
Quick wins: DNR trout stocking (#1) · Camp David TFR signal (#2) · fall foliage
weekly (#7) · aurora alerts (#8) · Google Pollen (#9) · GIS historic cemeteries
(#6). Bigger bets: liquor-board "opening soon" radar (#3) · civic meeting radar
(#5) · eBird/iNaturalist nature layer (#4/#11). Health inspections (#12) exist
but need a PIA request to the county health dept — owner letter, not code.

---


# Part 1 — Complete source inventory

# Frederick Radius — data-source inventory (audited 2026-07-02)

## Places (catalog)

- **Curated places catalog** — `src/data/places.ts` (~194 hand-written entries) + Supabase `places` table (seeded via `scripts/seed.ts`, `api/ingest/seed`) — hand-curated — the editorial core; last touched 2026-07-01.
- **Discovered places (Google Places sweep)** — `scripts/discover-places.ts` → `src/data/discovered-candidates.json` (1,294) → `discovered-clean.json`/`discovered-enriched.json` (1,035) → `places-discovered.json` (1,077) — build-time, manual re-runs — pipeline: discover → enrich (`enrich-discovered.ts`) → merge (`merge-discovered.ts`).
- **Google Places enrichment** — `src/lib/integrations/google-places.ts` (Places API v1, keyed) — runtime fetch, `revalidate: 86400` (24h) + build scripts `enrich-places.ts`, artifacts `places-enrichment.json` (2,386 rows), `places-photos.json` (3,009), `business-info.json` (36), `descriptions.json` (**empty**), `known-for.json` (5) — powers details/photos/hours/nearby.
- **Hours refresh** — cron `/api/cron/hours-refresh` (daily 08:00) walks Google-backed slugs on a 7-day hash cycle → `places-hours-refresh.json` (report-only; 1 row).
- **Business status** — cron `/api/cron/business-status` (daily 07:00) compares Google `businessStatus` vs `is_operational`; **reports only, does not persist** (serverless can't write the repo).
- **Human corrections** — `src/data/places-overrides.json` (fold/remove/patch, 4 top-level keys) — hand-curated, wins over normalizers by design (per CLAUDE.md).
- **Dedup/quality artifacts** — `places-dedup.json` (208), `dedup-decisions.json`, `copy-scores.json`, `photo-suppress.json`, `places-dfp.json` (1,279, scraped from downtownfrederick.org via `scripts/scrape-dfp.mjs`) — build-time; recomputed nightly by `/api/cron/data-health` (09:30, report-only).
- **Client dataset** — `src/data/places-client.json` (1,634) built by `scripts/build-client-places.ts` — **must be regenerated after any place-data change** (`npm run build:client-places`); search/map/funnel read this, not the loaders (PR #503 lesson).
- **County rec locations** — `src/lib/integrations/fcRecLocations.ts` (Frederick Co ArcGIS services5) — used only by build scripts (`ingest-rec-locations.ts`, `merge-rec-locations.ts`) → `rec-locations.json` (203), `rec-merge-plan.json`.
- **Parks/trails GIS** — `fcGis.ts`, `fcParks.ts`, `fcParkLocations.ts`, `fcTrails.ts` (fcgis.frederickcountymd.gov + gis.frederickco.gov ArcGIS) — runtime, `revalidate: 604800` (7d) — plus curated `curated-parks.ts` (66), `curated-trails.ts` (74), `park-amenities.json` (18, via `build-park-amenities.ts`).
- **OSM amenities** — `src/lib/integrations/overpass.ts` (3 Overpass mirrors, keyless) — runtime + build-time snapshots in `src/data/osm-amenities/*.geojson` (restrooms, water fountains, playgrounds, EV charging, bike parking, picnic, wifi) via `scripts/build-amenities.ts` → `amenities.json` (442).
- **MD open data** — `mdFarmersMarkets.ts` (opendata.maryland.gov, 7d) → also baked to `farmers-markets.json` (9, `build-farmers-markets.ts`); `mdHistoricPlaces.ts` (7d) — **no importers outside integrations dir**; `historicSites.ts` (NPS NRHP + MD historical markers ArcGIS).
- **NPS** — `src/lib/integrations/nps.ts` (keyed, 30 min) — park alerts/events for Catoctin & Monocacy.
- **Open Brewery DB** — `openBreweryDb.ts` (keyless, 24h) — **appears unused (0 external importers)**.
- **Boundaries** — `arcgis.ts` (MD iMAP boundaries/parcels/state parks, 24h); static `county-boundary.json`, `county-ring.json` (716 pts); `municipalities.ts` (13 towns, hand-curated).
- **Curated editorial layers** — `field-notes.json` (85 notes), `hidden-gems.ts`, `town-cliffnotes.json` (13), `history.ts` (40 entries), `food-trucks.ts` (42, updated 2026-07-01), `brunch.json` (14), `collections.ts`, `cravings.ts`, `wants.ts`/`intents.ts`, `seasonal-places.json`, `local-favorites.json`, `public-art.json`, `course-info.json` (golf, 8), `closures.json` (3, hand-tracked closures + `closures.ts`) — all hand-curated, mostly last touched mid/late June 2026.

## Events

- **Unified event set** — `src/lib/loaders/unifiedEvents.ts` — THE assembly (curated seeds + iCal live + Ticketmaster + Bandsintown + venue lineups), deduped/classified/time-sanity-guarded — `unstable_cache` 300s tagged `events`; kept hot by `/api/cron/warm-events` every 5 min.
- **Curated event seeds** — `src/data/events.ts` (~47) — hand-curated.
- **Live iCal/RSS feeds (request-time)** — `src/lib/integrations/ical-live.ts` (`revalidate: 3600`): Celebrate Frederick, Frederick County calendar, City of Frederick calendar, GFF Google Calendar, Mount Airy, Thurmont, Frederick History, Monocacy Brewing, Maryland School for the Deaf, recreater.com, Delaplaine. DFP (downtownfrederick.org) feed **removed June 2026** — they killed every machine-readable export (documented in `api/ingest/all/route.ts`); gated behind `DFP_ICAL_URL`.
- **Ingest crons (DB-persisting)** — `/api/ingest/all` (daily 09:00: Celebrate Frederick + county calendar → Supabase `events` via `src/lib/ingest/ical.ts`/`upsert.ts`, logged in `ingest_runs`), `/api/ingest/fcpl` (09:15, Frederick County Public Libraries, `src/lib/ingest/fcpl.ts`), `/api/ingest/fcvfra` (09:20, fire/rescue association events, `src/lib/ingest/fcvfra.ts`); plus manual routes `arcgis`, `celebrate`, `civicengage`, `county`, `seed`. Cache-key rule: bump `ingested-series-vN` after shape changes (PR #509).
- **Ticketmaster** — `ticketmaster.ts` (keyed Discovery v2) — uncached fetch wrapped by unifiedEvents' 300s cache — concerts + Keys games.
- **Bandsintown** — `bandsintown.ts` (keyed) against curated artist registry `src/data/bandsintown-artists.ts` — same caching.
- **SeatGeek** — `seatgeek.ts` (keyed, `revalidate: 3600`) — ticketed shows near Frederick; only 1 importer.
- **Eventbrite** — `eventbrite.ts` (keyed token, 3600) against curated organizer registry `src/data/eventbrite-organizers.ts`.
- **Venue lineups (agent-extracted)** — `scripts/ingest-venue-events.ts` (per-venue methods in `config/venue-sources.json`: deterministic Squarespace `?format=json` feed preferred, else scrape) → `src/data/venue-events.json` (25, with source+freshness) — build-time/manual.
- **Live-music venue iCals** — `src/data/live-music-venues.ts` (Tenth Ward, Monocacy Brewing, Bentztown, etc.) consumed request-time by ical-live; Squarespace JSON via `squarespace-live.ts` (3600, "no cron, kept fresh hourly").
- **Frederick Keys** — `frederickKeys.ts` (MLB StatsAPI schedule, keyless, 3600).
- **Hood College** — `hood.ts` (Trumba iCal, keyed via `HOOD_CALENDAR_URL`) — **no external importers found; likely dark**.
- **Visit Frederick** — `visitfrederick.ts` (event RSS, 3600).
- **Boundary cleaning** — `src/lib/events/normalize.ts` + `src/lib/format/placeName.ts` — all feed text normalized at ingest/load, never render-time.

## Civic / live conditions

- **NWS forecast** — `nws.ts` (api.weather.gov, keyless, 1800) — the most-used integration (20 importers).
- **NWS alerts** — `nws-alerts.ts` (600); fanned out by `/api/cron/notify-civic-alerts` every 30 min (with NPS alerts).
- **Civic press RSS** — `civic-press.ts` (city + county RSSFeed.aspx, 900).
- **FCPS news** — `fcps.ts` (fcps.org RSS, 600; calendar keyed via `FCPS_FEED_URL`).
- **Municipal civic data** — `src/data/municipal-civic.json` (11, via `scripts/ingest-municipal-civic.ts`), `departments.ts`, `department-contacts.ts`, `civic-actions.ts`, `town-websites.ts` — hand/script-curated.
- **MDOT CHART traffic incidents** — `mdot-chart.ts` (keyless, 120s).
- **PulsePoint fire/EMS** — `pulsepoint.ts` (keyed agency ID, 60s).
- **SeeClickFix 311** — `seeclickfix.ts` (keyless, 300).
- **FirstEnergy/Potomac Edison outages** — `firstenergy.ts` (public report.js, 600).
- **FAA airport status** — `faa-airports.ts` (nasstatus.faa.gov, 120); **METARs** via `aviationweather.ts` (900).
- **Local news** — `news.ts` (Google News RSS, 3600), `local-news.ts` (1800), `local-news-sources.ts` (Patch/FNP/MD Matters registry); `reddit.ts` (r/frederickmd, 900).
- **Parking** — curated `parking-garages.ts` (12 decks); `parking-live.ts` (`unstable_cache` 60s — **no real live feed exists**); `/api/cron/parking-alerts` (10 min, **DORMANT** until a feed is wired); `/api/cron/parking-forecast` (30 min, LIVE — predicts crunch from event starts, no external feed); ParkMobile deep links in `deeplinks.ts`.
- **Feed health** — `feed-registry.ts` (11 keyed + 11 keyless feeds catalog, powers /admin/data-health), `feed-snapshot.ts` + Supabase `feed_snapshots`; `/api/cron/link-health` (daily 06:00, rotating HEAD-check of outbound links); `alerts.ts` (internal admin alerting).

## Weather / environment

- **AirNow AQI** — `airnow.ts` (keyed, 1800).
- **USGS water gauges** — `usgsWater.ts` (waterservices.usgs.gov IV, keyless, 900) — river/creek levels.
- **NWPS flood stage** — `floodStage.ts` (api.water.noaa.gov gauge FDKM2 etc.).

## Transit

- **TransIT Frederick routes** — `transitFrederick.ts` (MD open-data GTFS route shapes, 7d) + baked `src/data/transit.json`; static GTFS built by `scripts/build-transit-gtfs.ts`.
- **TransIT real-time** — `transitRealtime.ts` (Passio GTFS-RT tripUpdates + vehiclePositions, `cache: "no-store"`), next-stop math in `transitNextStop.ts` (consumed via transitRealtime only).
- **MARC Brunswick line** — `marcTrains.ts` (MDOT MTA GTFS-RT S3 + alerts.pb, 30s) + static `marc-stations.ts` (5 stations) + `marc-schedule.json` (built by `scripts/build-marc-schedule.ts`, refreshed 2026-07-01).
- **Google Routes** — `google-routes.ts` (distance matrix, keyed, 3600) — drive times.

## Imagery

- **Google Place photos** — via `google-places.ts` → `places-photos.json` (3,009 refs), downloaded/optimized by `scripts/download-photos.ts`, `optimize-images.ts`.
- **Wikimedia Commons** — `wikimedia.ts` — town/history imagery with attribution.
- **Mapillary** — `mapillary.ts` (keyed, `graph.mapillary.com/map_features`) — street-level imagery + trash-can/litter map features; tile fan-out is fail-soft (`allSettled`).
- **Drone aerials** — `scripts/build-aerial-manifest.mjs` reads EXIF GPS/altitude/date from `public/images/seasons/{spring…winter}` → `aerial-manifest.json`; book/preview variants (`build-from-above-*.mjs`); `city-maps.ts` + `download-city-maps.ts`.

## Community / UGC (Supabase — user data, not mirrors)

Schema: `src/lib/db/schema.ts`. **User/community:** `radii` (saved places), `saved_events`, `push_subscriptions` + `push_log`, `beta_emails`, `submissions`, `user_profiles`, `follows`, `place_claims`, `business_updates`, `field_amenities` (community-confirmed amenities), `community_reports`, `commerce_link_reports`. **Mirrors/pipeline:** `municipalities`, `categories`, `tags`, `places`, `events`, `place_hours_refresh`, `data_sources`, `ingest_runs`, `civic_alerts`, `feed_snapshots`. Reminder crons: `/api/cron/saved-reminders` (10 min, **GATED OFF** unless `SAVED_REMINDERS_ENABLED=1`), `/api/cron/daily-briefing` (12:00/13:00 UTC, NWS + event count push).

## AI

- **Anthropic API** — `planner.ts` (`api.anthropic.com/v1/messages`) — runtime, powers /guide planning; also model-assisted venue-event extraction fallback in `scripts/ingest-venue-events.ts` (build-time only).

## Collected but never surfaced

- **`openBreweryDb.ts`**, **`mdHistoricPlaces.ts`**, **`hood.ts`** — integrations with zero importers outside `src/lib/integrations/` (Hood also keyed and likely dark per feed-registry).
- **`src/data/descriptions.json`** and **`places-amenities.json`** — committed but empty (0 rows).
- **Mapillary litter/trash-can map features** — fetched but no obvious UI layer beyond imagery.
- **Aerial EXIF altitude + DateTimeOriginal** — captured into the manifest; map layer uses coordinates only.
- **Report-only crons** — `business-status`, `data-health`, `hours-refresh`, `link-health` compute findings but persist nothing user-facing (admin/report surfaces only).
- **Dormant/gated**: parking-alerts cron (no live occupancy feed), saved-reminders (env-gated off), DFP iCal (`DFP_ICAL_URL` gate, upstream dead).
- **Supabase `data_sources` table** — registry exists but freshness is actually answered by `feed-registry.ts` + `feed_snapshots`.
- **SeatGeek** — configured in feed-registry, only one call site; verify it actually reaches unifiedEvents output.


# Part 2 — Quality & gaps

# Frederick Radius — data quality & gaps audit (2026-07-02)

## P0 — user-visible today

1. **Venue-events snapshot is fully expired — venue lineups surface is empty.**
   `src/data/venue-events.json`: 25 events, all `fetchedAt: 2026-05-31`, **0 with `starts_at` after 2026-07-02**. The committed snapshot (Weinberg etc.) contributes nothing to `unifiedEvents.ts`; those venues now depend solely on the runtime Squarespace fetch. Fix: re-run `scripts/ingest-venue-events.ts` and put it on a cron/checklist — a committed snapshot with no refresh mechanism is guaranteed to rot (it just did).

2. **Amenity enrichment never run — facet filters dark app-wide.**
   `src/data/places-amenities.json` is `{}` (3 bytes). `src/lib/loaders/placeAmenities.ts` documents the wiring: tags + FACET_CANDIDATES already exist; the moment `npm run enrich:amenities` + `npm run build:client-places` run, outdoor-seating/dog-friendly/takeout/etc. facets light up with no code change. Cheapest high-leverage win in the repo.

3. **616 of 1,634 places (38%) still show generic scraped blurbs ("Category in Town").**
   `places-client.json` pattern count: 616 generic blurbs; `src/data/copy-scores.json` counts: `scraped: 971, auto_clean: 360, reviewed: 0` — **zero** editor-reviewed copy in the whole catalog. `description` is null for 1,633/1,634. Fix: an editorial pass ordered by `feature_score`, tracked via copy-scores.

4. **Hours-freshness policy is inert and its input pipeline is empty.**
   `src/data/places-hours-refresh.json` contains only its `_doc` (pull from `place_hours_refresh` never run); `hours-freshness.ts` sets a 7-day window but `HOURS_FRESHNESS_ENFORCED` is off, so open/closed badges render off static enrichment whose `last_verified_at` is **uniformly 2026-05** for all 1,634 places — every open assertion is already >30 days stale by the policy's own standard. Trust-report `below_gate` is hardwired `false` ("reported, not yet enforced", `src/lib/quality/trust-report.ts:95`). Fix: run the hours-refresh cron cycle (`/api/cron/hours-refresh` exists), pull to JSON, then flip the flag.

## P1 — staleness with no re-verification loop

5. **Everything hand-verified says 2026-06 and nothing re-checks it.** Aging out together:
   - `field-notes.json`: 274 items, all `last_verified: 2026-06`; **39 of 139 deals lack `last_verified` entirely** and are silently withheld by the todaysDeals honesty gate.
   - `town-cliffnotes.json`: all 13 towns `last_verified: 2026-06`.
   - `parking-garages.ts`: rate schedule + payment "verified 2026-06"; `hourly_rate`/`capacity` intentionally null since first ship — never backfilled.
   - `live-music-venues.ts`: endpoints "fetch-verified 2026-06-20"; `fcParks.ts` "verified 2026-06-20".
   No mechanism (cron, report, or checklist) re-verifies any of these. Fix: a monthly `verified-before:<date>` report in the data-health admin page.

6. **Curated "until this file is curated" datasets shipped empty and stayed empty:**
   - `local-favorites.json`: `picks: []`, `exclude: []` — proxy signal only.
   - `public-art.json`: `pieces: []` — the "signature map asset" (Phase 4) renders nothing.
   - `known-for.json`: 5 entries / 1,634 places (one has empty `known_for: []`).
   - `descriptions.json`: `{}` **and** zero src imports — empty *and* dead; delete or fill.
   - `closures.json`: 4 manual entries, all `place_id: null`, one dated "2020" — no closure-detection process.

## P2 — coverage gaps (quantified)

7. **Places debt** (`places-client.json`, n=1,634): no hours 396 (24%) — worst per-town: Middletown 33/86, Burkittsville 19/37, Woodsboro 19/43, Frederick 150/871; no photo entry 219 (13%); no price_band 1,585 (97%); no tags 1,287 (79%); no website 210; no phone 241; no Google rating 166.
8. **Field notes**: 85 places (5% of catalog) — parking 33, insider 65, deals 52, happy_hour 41. Fine as a curated layer, but concentrated coverage should be stated somewhere users/editors can see.
9. **Thin curated food layers**: `brunch.json` 14 entries, `business-info.json` 36 entries — surfaces render county-wide but data is Frederick-city-centric.

## P3 — SPOF feeds & dead data

10. **Fail-soft = silently empty.** `unifiedEvents.ts` races every feed against 8s and degrades to `[]` (good: no hang), but nothing alerts when a feed dies — Ticketmaster, Bandsintown, SeatGeek, Eventbrite, VisitFrederick, Keys, Squarespace, and `getIngestedSeries` (Supabase down → `[]`, `ingested.ts:91,105`) all vanish without trace. `getLiveEvents` returns `sources_failed[]` but `unifiedEvents` discards it. Same pattern in `communityReports.ts` and `fieldAmenities.ts`. Fix: log/emit `sources_failed` into the data-health cron so a dead feed is a report line, not a quiet blank.
11. **Dead weight in src/data (~1.8 MB shipped in repo, zero app imports):** `discovered-candidates.json` (486 KB), `discovered-clean.json` (476 KB), `places-discovered.json` (661 KB), `rec-locations.json` (101 KB), `rec-merge-plan.json` (32 KB), `descriptions.json` — script-only or orphaned pipeline intermediates. Move to `scripts/data/` or delete.
12. **Dead Supabase table:** `civicAlerts` (`src/lib/db/schema.ts:204`) has zero references outside the schema. `dataSources`/`radii`/`feed_snapshots` are near-dead (referenced only 2x each, worth confirming before pruning).

**Process fix common to most of the above:** the app has a data-health cron and trust report but they only measure provenance/hours — extend them to assert on (a) venue-events snapshot max `starts_at` > now, (b) newest `refreshed_at` in places-hours-refresh, (c) count of `last_verified` older than N days across field-notes/cliffnotes, (d) `sources_failed` from live feeds. Every P0/P1 here would have been a red line on that page instead of a silent blank.


# Part 3 — New external sources (verified)

# Frederick Radius — new data-source scout report (verified July 2026)

## First, corrections to the brief: things the app ALREADY uses

Repo inspection (`src/lib/integrations/`, `src/data/local-news-sources.ts`) shows several items on the investigation list are already integrated, so they are excluded from the ranking: Frederick News-Post RSS (`local-news-sources.ts`, FNP search RSS + Patch + Maryland Matters), city/county CivicPlus press-release RSS (`civic-press.ts`), FCPS closings RSS (`fcps.ts`), fire/EMS live dispatch via PulsePoint (`pulsepoint.ts`, reverse-engineered feed with medical-call filtering), SeeClickFix/Open311 (`seeclickfix.ts`), NPS alerts+events for CATO/MONO/CHOH (`nps.ts`), MD Historical Trust National Register via Socrata `yf2f-by4g` (`mdHistoricPlaces.ts`), MD farmers-markets Socrata `fpk6-yugb`, FirstEnergy/Potomac Edison outages, Reddit pulse, Open Brewery DB, aviation weather.

## Top 12 new sources, ranked by (uniqueness × usefulness) / effort

### 1. Maryland DNR trout stocking — Frederick County waters
- **Verified:** yes. Live table at `https://dnrweb.dnr.state.md.us/fisheries/stocking/stockingtable.html` (plain HTML: Date / County / Location / Number-Species / Regulations; empty mid-summer, fills daily in spring and fall runs). Program page `dnr.maryland.gov/fisheries/pages/trout/stocking.aspx`; there is also an ArcGIS Experience dashboard (`experience.arcgis.com/experience/6ead6ac1d51449f89579345282dfea28`) implying a queryable feature service behind it.
- **Access:** open scrape of a stable HTML table + ArcGIS REST. No key. Cadence: daily during stocking season (roughly Feb–May, Oct–Nov). State data, effectively public domain.
- **Feature:** "Stocked this week" card on /rivers and Today — Frederick has marquee waters (Big Hunting Creek is Maryland's storied fly-fishing-only stream, plus Owens Creek, Fishing Creek, Friends Creek, Cunningham Falls Lake, Frank Bentz Pond, Rainbow Lake). Pairs perfectly with the existing USGS gauges/CreekWatch. No local app does this. Effort: low.

### 2. FAA TFRs — the Camp David signal (P-40, Thurmont)
- **Verified by established structure:** `tfr.faa.gov` publishes the active TFR list with per-TFR XML/JSON detail (FAA also exposes this via its external data API). Frederick County contains permanently restricted area P-40 around Camp David; when the President visits, an expanded TFR is issued.
- **Access:** open fetch, no key. Cadence: near-real-time as NOTAMs issue. US-government data, public domain.
- **Feature:** genuinely one-of-a-kind local intelligence — "Camp David airspace ring expanded today" as a quiet Today note for Thurmont/Catoctin (explains helicopters, road activity). Also flags airshow/firefighting TFRs near FDK. Effort: low. Caution: present it as airspace status, not presidential tracking, in voice.

### 3. Frederick County Liquor Board agendas — a "opening soon" restaurant radar
- **Verified:** yes. The Board of License Commissioners publishes monthly hearing agendas in the county CivicPlus AgendaCenter, e.g. `https://www.frederickcountymd.gov/AgendaCenter/ViewFile/Agenda/_05112026-1039` (May 11, 2026). Agendas list new Class A/B beer-wine-liquor applications with trade names and addresses.
- **Access:** AgendaCenter HTML/PDF (CivicPlus AgendaCenter also exposes RSS per-board). Cadence: monthly. Public record.
- **Feature:** a new on-sale license application is the earliest public signal a restaurant/bar is coming — months before Google Places knows. Feeds the places pipeline and a "Coming to Frederick" surface. Effort: moderate (PDF/HTML parsing, name/address extraction).

### 4. eBird API 2.0 — Frederick County (region US-MD-021)
- **Verified partially:** the API exists and Frederick County's region code is US-MD-021; my direct fetch of `api.ebird.org/v2/ref/hotspot/US-MD-021` returned 403 because eBird requires a (free) API key header on essentially all endpoints now.
- **Access:** free API key; hotspots, recent observations, notable/rare sightings by region. Cadence: near-real-time. **License caution:** Cornell's API terms allow display with attribution but prohibit bulk redistribution and require staying within their use policy; recheck terms before shipping, and cache lightly.
- **Feature:** "Notable birds this week" + hotspot layer (Fred Archibald Audubon Sanctuary, Lilypons, Monocacy NRMA) — exactly the field-guide identity of the app. Effort: low.

### 5. Civic meeting radar — CivicClerk (county) + AgendaCenter RSS (city)
- **Verified:** County Council/boards run on CivicClerk at `https://frederickco.portal.civicclerk.com/` (portal confirmed; CivicClerk exposes a public OData-style API per tenant — my probe of `frederickco.api.civicclerk.com/v1/Events` got a 503, so confirm the exact API host during build). County also archives video via Granicus (`frederick.granicus.com/ViewPublisher.php?view_id=10`). City of Frederick agendas: CivicPlus AgendaCenter at `cityoffrederickmd.gov/573/Agendas-Minutes` (AgendaCenter has per-board RSS). No Legistar anywhere in Frederick.
- **Access:** open portal/RSS; API likely but needs one build-time verification. Cadence: weekly. Public record.
- **Feature:** "What your government decides this week" — planning commission and council items geocoded to neighborhoods ("rezoning hearing 0.4 mi from you"). High civic uniqueness. Effort: moderate.

### 6. Frederick County GIS Hub — unused layers
- **Verified:** yes. Hub is `https://gis-fcgmd.opendata.arcgis.com/` with GeoJSON/GeoServices/WMS APIs. DCAT catalog confirms layers not in the app: **Zoning Designations**, Historic Cemeteries of Frederick County, Critical Farms + Agricultural Preservation lands, fire hydrants, fire station service areas, water/sewer service areas, building footprints, bridges inventory, edge of pavement, community growth boundaries/comp plan.
- **Access:** open ArcGIS REST, no key. Cadence: layer-dependent (zoning on amendment; most quarterly-ish). Standard open-data terms.
- **Feature:** three standouts — (a) **Historic Cemeteries** as a heritage discovery layer (perfect field-guide material, sibling to the National Register layer already shipped); (b) **Zoning + growth boundary** context on place/parcel views; (c) **Critical Farms/ag preservation** underlay for an orchards/farm-country story. Effort: low per layer (arcgis.ts plumbing exists).

### 7. Maryland DNR Fall Foliage Report
- **Verified by program:** DNR publishes a weekly statewide foliage report each Sept–Nov (HTML page + email), with Catoctin/Frederick specifically called out most weeks. (Structure is prose-by-region; parse or lightly summarize.)
- **Access:** open scrape, weekly in season. State publication.
- **Feature:** "Leaf status on Catoctin this week" seasonal Today card — Frederick is a leaf-peeping destination (Gambrill, Cunningham Falls, Catoctin). Fits the existing `seasonal-notes.ts` pattern. Effort: low, seasonal.

### 8. NOAA SWPC aurora + geomagnetic feeds
- **Verified by established structure:** `services.swpc.noaa.gov` JSON (OVATION aurora forecast, planetary Kp, 3-day forecast). Open, no key, public domain, updated ~30 min.
- **Feature:** "Aurora possible tonight from Frederick's dark spots" alert (Kp threshold ~7 for 39.4°N), paired with a static dark-sky pointer (Gambrill overlooks, ag land north of Woodsboro). Rare-event delight feature; near-zero effort. (Skip lightpollutionmap.info tiles — licensing is restrictive; use a one-time static note instead.)

### 9. Google Pollen API — daily allergy index
- **Verified by product:** Google Maps Platform Pollen API covers the US at ~1 km, daily forecasts for tree/grass/weed with plant detail. The app already has Google Places billing, so it's the same account.
- **Access:** API key, paid per-call (cheap at one county-centroid call/day, cacheable). License: Google Maps Platform terms — display with attribution.
- **Feature:** pollen chip alongside the existing AQI on Today. Frederick's tree pollen season is brutal; high daily utility. Effort: very low. (No open/free alternative verified: NAB counting stations are DC-area and not API-accessible; Pollen.com scraping is against ToS.)

### 10. Winter ops: MDOT STORM plow tracker + CHART snow emergency plans
- **Verified:** STORM (statewide AVL plow map, `Know Your Roads` at mdot.maryland.gov; 30-minute truck history) and CHART's per-county Snow Emergency Plan status (`chart.maryland.gov/SnowEmergencyPlan/GetSnowEmergencyPlan`). City publishes static snow-removal maps (`cityoffrederickmd.gov/546`). **Coverage caveat:** STORM is state-maintained routes only; county/city plows are not in it, and no Frederick-county-fleet AVL feed was found.
- **Access:** CHART snow-emergency status is fetchable alongside the CHART data already integrated; STORM's underlying feed needs endpoint inspection (web app, likely ArcGIS service).
- **Feature:** "Snow emergency plan in effect for Frederick County" + plow activity on numbered routes, layered on the existing CHART incidents. Effort: low (CHART part) to moderate (STORM AVL).

### 11. iNaturalist API — Frederick County observations
- **Verified by established structure:** open API (`api.inaturalist.org/v1/observations?place_id=...`), Frederick County MD has a place_id; no key needed for reads.
- **License caution:** per-observation licenses vary (CC0/CC-BY/CC-BY-NC/all-rights-reserved) — filter to openly licensed observations and attribute per record; obscured coordinates for sensitive species must be respected.
- **Feature:** "Seen in the wild this week" (first spring bloodroot at Sugarloaf-adjacent trails, box turtles, morels-adjacent fungi) — complements eBird for the almanac/proto surface already in the repo. Effort: low-moderate.

### 12. Restaurant health inspections — real but locked behind PIA
- **Verified:** Frederick County Health Department's Food Control Office (`health.frederickcountymd.gov/352/Food-Control`) inspects all food facilities but **publishes no online portal, database, or downloads** (page confirms licensing info only). Maryland has **no statewide restaurant-inspection portal** (health.maryland.gov covers other facility types). The only public serialization is the Frederick News-Post's monthly "Health Inspections" feature (`fredericknewspost.com/.../health_inspections/`), which lists critical violations — but that is FNP's copyrighted editorial product, not a reusable dataset.
- **Access:** Maryland Public Information Act request to FCHD for inspection records (repeatable monthly), or ask FCHD directly whether they'd share a machine-readable export — small counties sometimes will.
- **Feature:** inspection status on place pages would be a genuine differentiator, which is why it stays on the list despite the highest effort. **Legal caution:** do not scrape/reproduce FNP's compilation; source from FCHD records only.

## Investigated and deliberately NOT recommended

- **Crime maps:** City of Frederick PD uses LexisNexis Community Crime Map (confirmed via city CivicAlert; CrimeReports retired) and the county runs a Geocortex "Crime Mapper" at `maps.frederickcountymd.gov`. Both are display portals whose ToS prohibit scraping; no open CAD dataset exists on either GIS hub. Path if wanted: PIA request or ask FPD for the underlying feed. Also fits poorly with the app's calm field-guide voice.
- **Building permits:** no permit dataset on the county or city hubs (confirmed absent from the county DCAT catalog); permit search is a citizen-self-service web app only. PIA or vendor-API territory — revisit later.
- **MD SDAT new business registrations:** entity data exists but bulk "Corporate File" access is a paid SDAT product; the free search UI is not scrape-friendly, and the Socrata SDAT datasets are aggregates only. The liquor-board agendas (#3) deliver most of the same "what's opening" value free.
- **RITIS:** account-gated (public-agency oriented) — CHART already covers the useful surface. MD 511 is a front-end over CHART.
- **SunsetWX:** could not verify the API is still commercially alive in 2026; treat as dead until proven otherwise. Sunrise-quality can be approximated from NWS cloud-cover grids already in hand.
- **Nextdoor:** no public API for content; prohibited.
- **MHT Medusa:** browsable but the National Register layer already shipped covers the high-value subset; full MIHP inventory adds little for users.

## Cross-cutting legal notes

Government feeds (DNR, FAA, SWPC, CHART, county/city GIS, AgendaCenter) are public records — attribute and link. The three that need care: eBird (recheck Cornell API terms; no bulk redistribution), iNaturalist (per-record CC licensing), Google Pollen (Maps Platform display terms). Never reproduce FNP's inspection compilations or LexisNexis crime-map data.
