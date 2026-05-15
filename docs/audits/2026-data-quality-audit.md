# Frederick Radius Data Quality Audit (Phase 0)

Date: 2026-05-15
Scope: Read-only audit per the Data Quality Fixes spec, section 4. No code changed. No fixes applied.
Status: Complete. Awaiting approval before Issue 1.

---

## 0. Critical finding to resolve before any fix (surfaced, not actioned)

The spec assumes a relational data model: a places table, an events table, additive columns, `place_duplicate_review` and similar tables, and render queries that can take a `WHERE place_canonical_id IS NULL` clause.

The application does not work that way for places or events.

- Places are served from static files: `src/data/places.ts` (about 51 curated rows) which imports and merges `src/data/places-dfp.json` (1,280 scraped rows) into a single in-memory `PLACES` array.
- Place enrichment (hours, photos, rating) is a static file, `src/data/places-enrichment.json` (51 entries), plus an on-demand Google route cached in the Next.js data cache.
- Events are served from static `src/data/events.ts` plus live iCal at request time plus ingested municipal rows.
- The Postgres database (Supabase, via Drizzle) contains only four tables in `src/lib/db/schema.ts`: `civic_alerts`, `data_sources`, `radii`, `tags`. Migration `drizzle/0001_event_ingestion.sql` adds event ingestion tables (`raw_events`, `ingested_events`, and related) outside `schema.ts`. There is no places table and no events table.
- The render path for places is `rankPlaces` and `placesWithinRadius` in `src/lib/loaders/places.ts`. These filter the in-memory `PLACES` array. There is no SQL query to add a `WHERE` clause to.

This does not block the five fixes, but it changes the mechanism of every one of them. "Add a column" becomes "add a field to the data file or a generated side map." "Add `WHERE place_canonical_id IS NULL`" becomes "filter the merged `PLACES` array in the loader." The additive-only and feature-flag rules still hold and are still achievable.

Per the spec operating rules ("If a fix appears to require a destructive change, stop and surface it" and "surface every external dependency"), this is surfaced here for a decision before Issue 1. Recommended resolution: keep the spec's intent (canonical pointer, review table, flagged render filter) but implement it at the data-file and loader layer rather than as SQL DDL. No spec rewrite is requested or performed in Phase 0.

---

## A. Repo structure and stack

- Framework: Next.js 16.2.6 (App Router), React 19.2.0, TypeScript, Tailwind 4.
- Database: Supabase Postgres via `drizzle-orm` 0.45.2 and `postgres` 3.4.9. Tables in `schema.ts`: `civic_alerts`, `data_sources`, `radii`, `tags`.
- Migrations: `drizzle/0000_adorable_roxanne_simpson.sql`, `drizzle/0001_event_ingestion.sql`, `drizzle/meta`.
- Hosting: Vercel. Production functions run in UTC. Local development on the owner's machine runs in America/New_York. This difference is the root of Issue 2 (see section C).
- Ingestion code: `src/lib/ingest/` (`parser.ts`, `location.ts`, `upsert.ts`, `geocode.ts`, `ical.ts`) and `src/app/api/ingest/*` (`arcgis`, `celebrate`, `civicengage`, `county`, `dfp`, `seed`, `all`).
- Render layer: `src/lib/loaders/` (`places.ts`, `events.ts`, `ingested.ts`, `calendar.ts`) feeding App Router pages in `src/app/(app)/`.
- No `CLAUDE.md`, `AGENTS.md`, or prior `docs/` directory existed. `docs/audits/` was created to hold this file.

## B. Place data audit

- Total places in the rendered `PLACES` array: 1,331 (18 `seed`, 33 `manual`, 1,280 `dfp`).
- Places with a Google `place_id`: 1,237 of 1,331 (93 percent). Coverage by source: `places-dfp.json` 1,237 of 1,280, `places-enrichment.json` 51 of 51, `places.ts` 1.
- Render selection: `src/lib/loaders/places.ts`, functions `rankPlaces` and `placesWithinRadius`, filter the in-memory array with `isOperational`. There is no database query and no canonical filter today.

Duplicate clusters. A conservative name-normalization pass (lowercase, strip apostrophes and ampersands, drop "the/llc/inc/co", collapse punctuation) found 20 clusters with more than one row, accounting for 20 duplicate rows. This undercounts substantially because it does not apply Levenshtein distance, geo proximity, or `place_id` equality, all of which the Issue 1 spec requires. The dominant patterns:

- Cross-source duplication, a curated `manual` or `seed` row plus its `dfp` scrape for the same business. About 13 of the top 20 clusters: Carroll Creek Linear Park, Weinberg Center for the Arts, National Museum of Civil War Medicine, Delaplaine Arts Center, C. Burr Artz Public Library, Carroll Creek Parking Deck, Court Street Parking Deck, Brewer's Alley, Hootch & Banter, Olde Mother Brewing, Curious Iguana, North Market Pop Shop, Isabella's Taverna & Tapas Bar, The Tasting Room, Pretzel & Pizza Creations.
- Intra-DFP name variants: The Frederick City Market, Donald B Rice Tire Co, Blue Horizon Construction, Family Heritage Trust Company, Frederick Basket Company.

Named-business deep check across the full merged set:

- Isabella's: 3 rows. "Isabella's Taverna & Tapas Bar" (manual), "Isabellas Taverna Tapas Bar" (dfp), "Isabellas Taverna and Tapas Bar" (dfp).
- Hootch: 3 rows. "Hootch & Banter" (manual), "Hootch and Banter" (dfp), "Hootch Banter" (dfp).
- McClintock: 3 rows. "Mcclintock Distillery", "Mcclintock Distilling", "Mcclintocks Back Bar" (all dfp; Back Bar may be a distinct venue and should not auto-merge).
- Magoo's: 2 rows. "Magoo's Pub & Eatery" (manual), "Magoos Pub and Eatery" (dfp).
- Brewer's Alley: 2 rows. "Brewer's Alley" (manual), "Brewers Alley" (dfp).
- Sumittra: 1 row in the current data. The reported duplicate is not reproducible in this dataset and should be re-checked against the live site at fix time.

Projection: with the spec's full matching rules (exact `place_id` match scored 1.0, plus normalized-name Levenshtein at 0.85, plus 75 meter proximity), the candidate count will far exceed the conservative 20. 1,237 `place_id` values across 1,331 rows, with many shared between a curated row and its DFP scrape, means `place_id` equality alone will surface a large cluster set. The spec's expectation of at least 100 candidate clusters is realistic.

## C. Event data audit (timezone)

Root cause is confirmed by deterministic reproduction, not inference.

Static seed events, `src/data/events.ts`. The `at(offsetDays, hour, minute)` helper builds a Date, calls `d.setHours(hour, minute, 0, 0)`, then `iso = date.toISOString()`. `setHours` uses the server local timezone. Reproduction of `at(0, 17, 0)`, intended 5:00 PM:

- `TZ=UTC` (production): stored `2026-05-14T17:00:00.000Z`, rendered in America/New_York as 1:00 PM. Four hours early under EDT, five hours early under EST.
- `TZ=America/New_York` (local dev): stored `2026-05-14T21:00:00.000Z`, rendered as 5:00 PM. Correct.

This is why the times look correct in local development and are wrong on the live site. Verdict: broken.

Live iCal feeds, `src/lib/integrations/ical-live.ts` (Downtown Frederick Partnership, Celebrate Frederick, Frederick County). `parseICalDate` handles a trailing `Z` correctly with `Date.UTC(...)` at line 166. For `TZID` values it returns `new Date(+Y, +Mo - 1, +D, +H, +Mi, +S)` at line 168, with the comment "For TZID values we treat as local; close enough for display." On a UTC production server this constructs the wall-clock time as UTC, producing the same four to five hour early shift for every TZID-bearing event. CivicEngage and partner iCal commonly use `TZID=America/New_York`. Verdict: broken for TZID events, correct for `Z`-marked events.

Ingested CivicEngage, `src/lib/ingest/parser.ts`. Uses `ICAL.Time.toJSDate().toISOString()`, which resolves the component timezone to a true UTC instant, and coerces all-day values to America/New_York midnight via `Intl`. Existing tests assert the correct conversion. Verdict: correct. Do not touch.

Hood, `src/lib/integrations/hood.ts`. Relies on the upstream parser having already produced a correct Date instance, then calls `toISOString()`. Correctness depends entirely on the upstream library resolving the timezone. Verdict: unverified. Recommend a source spot-check during the Issue 2 acceptance step rather than a code change on assumption.

Render layer. `src/lib/loaders/events.ts` formats with explicit `timeZone: "America/New_York"` (lines 152, 158, 173 to 177). The render layer is correct. Consistent with the spec, the fix belongs in ingest and time construction, not in render.

Note on the 30-event live sample. Phase 0 is read-only and should not add network sampling. The deterministic reproduction above establishes root cause and a per-feed verdict with higher confidence than a hand sample would. The 30-event live source-versus-render comparison is recommended as the Issue 2 acceptance test (spec section 6), where it belongs.

## D. Hours data audit

- Verified hours coverage is roughly 48 of 1,331 places, about 3.6 percent. Sources: `places-enrichment.json` has 45 of 51 entries with non-empty `weekday_hours`, and `src/data/places.ts` has 3 rows with `hours_verified: true`.
- Stale hours: not separately tracked. There is no `hours_verified_at` field today, so staleness cannot be measured. This confirms the need for the Issue 3 additive timestamp.
- No hours: `places-dfp.json` has 0 of 1,280 rows with any hours field. The large majority of the dataset has no hours.
- The dominant string is produced at `src/lib/hours.ts:93`, "Hours not posted · call to check" (and line 92, "Hours not confirmed · call to check"), returned whenever status is unverified. With about 96 percent of places lacking verified hours, this is the default state across the site, which directly contradicts the homepage "what's open right now" framing.
- Google Places usage: build-time enrichment via `npm run enrich` (about 51 calls, one-off, low cost) plus an on-demand per-place route cached for seven days in the Next.js data cache. There is no daily cron and no continuous quota draw. There is no visible cost dashboard in the codebase. New paid quota for Issue 3 broad hours coverage should be sized and surfaced in that PR.

## E. Category audit

Three different category mechanisms feed the events surface:

- Static `src/data/events.ts`: clean consumer slugs only (`arts`, `family`, `food`, `market`, `music`, `outdoors`, `theater`). Correct, no action.
- Live iCal `src/lib/integrations/ical-live.ts`: a keyword to slug map (`CATEGORY_KEYWORDS`, lines 69 to 80) producing clean slugs (`music`, `theater`, `gallery`, `market`, `family`, `outdoors`, `brewery`, `winery`, `food`, `bar`, `civic`). Reasonable, no raw leakage observed.
- Ingested CivicEngage: `config/civicengage_sources.json` defines a per-source `category_map` keyed by catid. Unmapped catids fall through to the raw source category. `src/lib/loaders/ingested.ts:101` passes `category: head.category` straight through, and `src/components/event/SeriesCard.tsx:63` renders `{series.category}` verbatim with no translation helper.

Conclusion: the raw Frederick County taxonomy ("Workforce Services", "Galleries", and similar) leaks specifically through the ingested CivicEngage path where a catid is not present in that source's `category_map`, and is then rendered verbatim. Issue 4's `category_translation` table plus a `translateCategory` helper at the render boundary is the correct shape. The existing `category_map` in config is a partial, source-coupled version of the same idea and can seed the translation table.

## F. Description audit

Method: heuristic classifier over all 1,280 DFP rows. A row is counted as `scraped_fragment` if the text repeats the venue name at the start, contains an address or "Frederick, MD 2170x" string, contains emoji or OCR noise, or is shorter than 25 characters. Otherwise `auto_clean`. This is an estimate, as the spec requests, not a labeled count.

- DFP (`places-dfp.json`, n=1,280): about 931 `scraped_fragment` (73 percent), about 349 `auto_clean` (27 percent), 0 empty.
- Curated (`src/data/places.ts`, about 51 rows): hand-written editorial prose, classifiable as `reviewed` or `auto_clean`. Samples are clean and consistent.
- Full dataset (1,331): roughly 70 percent `scraped_fragment`, roughly 30 percent `auto_clean` or `reviewed`.

Representative DFP fragments observed: "Dancing Bear Toys and Games Patrick St", "Isabella's Taverna & Tapas Bar Dec 2025 • Friends", "Here's his 2026 Wishlist: 1 Show up and do the thing", "WealthFlow Financial Schedule a review today". These show name-repeat, social-scrape noise, and calls to action rather than descriptions. The Issue 5 classifier and first-sentence truncation approach is well matched to this data.

## G. Per-issue readiness summary

1. Place dedupe: ready. Mechanism must be data-file and loader level, not SQL (see section 0). Pattern is dominated by cross-source curated-versus-DFP pairs and intra-DFP name variants. `place_id` equality will do most of the work.
2. Event timezone: ready, root cause confirmed. Fix the seed `at()` constructor and the `ical-live.ts` TZID branch. Do not touch `parser.ts` (correct) or the render layer (correct). Verify Hood against source during acceptance.
3. Hours pipeline: ready. No `hours_verified_at` exists today, so the additive timestamp is required to measure staleness at all. Broad Google or FSQ coverage is a new quota to size and surface.
4. Category remap: ready. Leak is isolated to the ingested CivicEngage unmapped fallback rendered verbatim at `SeriesCard.tsx:63`. Static and live iCal paths are already clean.
5. Description quality: ready. About 70 percent of the rendered dataset is scraped fragments. Classifier plus first-sentence truncation behind a flag is appropriate.

## Sign-off

Phase 0 is complete. No application code, schema, data, or configuration was changed. Only this audit file was added. Awaiting approval and direction on the section 0 mechanism question before starting Issue 1 in a separate session.
