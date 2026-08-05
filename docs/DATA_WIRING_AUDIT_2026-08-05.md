# Data wiring audit — built but not used (2026-08-05)

The complement of the dead-code sweep. Everything here is REACHABLE code or
stored data that never got wired into a surface where it earns its keep. Every
item was verified by reading the producing code and grepping every consumer.
Ranked by value-to-effort. Owner mandate (2026-08-05): "lots of things are
built but not properly added to for use in the app — can we fix all of those
issues?"

Status legend: WIRE (connect it), CUT (delete it), DECIDE (owner call),
DONE (handled — noted where).

## Tier 1 — high value, small/medium effort

1. **WIRE — Ticketed event feeds drop description, image, price, lineup.**
   `ticketmaster.ts:167`, `seatgeek.ts:125`, `eventbrite.ts:88`,
   `bandsintown.ts:74` all emit `description: ""` unconditionally, and the raw
   types never parse Ticketmaster `info`/`classifications`/`attractions`
   (performer + support lineup), SeatGeek performer names, Eventbrite
   `description.text`/`logo.url`, or Bandsintown `lineup[]`/`offers[]`.
   `/events/[slug]` renders an empty body for the marquee ticketed rows while
   EventCard/EventSheet already have wired slots for `hero_image` and
   `price_text` (proof: `ical-live.ts:121-131`). Small per adapter.

2. **WIRE — `audience[]` hardcoded empty on every live event.**
   `ingestedEvents.ts:258`, `liveEvents.ts:218`, `venueEvents.ts:191`. The
   facet machinery is fully built (`intents.ts:175`, `?kids=1` in
   EventsExplorer) but only 18 curated rows populate it; `isForGroups` has
   zero call sites. Populate from iCal CATEGORIES, FCPL program types,
   Ticketmaster classifications.

3. **WIRE — Event topical category quarantined to two feed domains.**
   `ingested.ts:182` nulls category unless the domain is the library or
   fcvfra; everything else lands in "community". The county `catid` IS stored
   in `ingested_events` and thrown away on read. Rebuild the catid map or add
   a classifier; /events rails, /live-music, and Compass all see one giant
   bucket today.

4. **WIRE — `/trust` is static prose while the coverage math runs admin-only.**
   `lib/quality/coverage.ts` (summarizeCoverage, by-town, by-category,
   hours-freshness) is consumed only by `/admin/coverage`. `/trust` should
   prove its claims with the same numbers; `/m/[municipality]` wants the
   per-town lines. Aggregate only.

5. **WIRE — CostTransparency built for /trust, never mounted.**
   `src/components/trust/CostTransparency.tsx` + `src/data/cost-transparency.ts`.
   Kept out of the dead-code sweep on purpose (restored 2026-08-05); one
   import + one JSX line on /trust.

6. **WIRE — `commerce_link_reports` is write-only.** Written by
   `/api/commerce/report-link`, read by nothing. A user reporting a dead
   ordering link produces nothing. Copy the `/admin/reports` queue pattern or
   add a data-health tripwire.

7. **WIRE (owner) — Amenity facets wait on an empty file.**
   `places-amenities.json` is `{}`; `placeAmenities.ts` maps 10 Google fields
   to existing tag slugs and the facet UI lights up with no code changes.
   Blocked on `npm run enrich:amenities` + `npm run build:client-places`
   (needs GOOGLE_PLACES_API_KEY — task #76).

8. **DONE (CUT, this branch) — `/api/discover/*` was a paid Google surface
   with zero callers.** Both routes + `google-nearby.ts` +
   `google-autocomplete.ts` deleted; `LocationAutocomplete.tsx` (their only
   would-be consumer, itself unmounted) went in the same sweep. If an
   address autocomplete is wanted later, rebuild against the then-current
   Places API — this was unbilled-but-open attack surface.

9. **WIRE — Wikipedia thumbnails fetched and dropped.** `wikiContext.ts:57`
   requests `piprop=thumbnail`; `NearbyContext.tsx` renders text only and
   slices to 2. Trivial.

## Tier 2 — real value, medium effort

10. **WIRE — County planning applications carry polygons that never draw.**
    `fcPlanningProjects.ts` returns geometry + milestones; the only consumer
    is a text Ask answer that ends by linking OFF-app to county GIS. "What
    are they building there" deserves a /map overlay or /m/[town] section.

11. **WIRE — Visit Frederick refresh cron exists but is not scheduled.**
    `/api/cron/visit-frederick` has no `vercel.json` entry (every other cron
    does), so the durable snapshot never refreshes on schedule. One line —
    but verify the Firecrawl spend guard first.

12. **WIRE — iCal parser ignores CATEGORIES, GEO, ATTACH, ORGANIZER.**
    `ical-live.ts:980` handles 8 properties. CATEGORIES feeds findings 2–3;
    GEO would give per-event coordinates (today every iCal row is
    venue-centroid, suppressing real distances); ATTACH carries images.

13. **DECIDE — featured-events editorial lever is severed at the caller.**
    `lead-rank.ts` takes `featured?: ReadonlySet<string>` and documents that
    callers resolve it via `featuredEventSlugs` (`lib/events/featured.ts`,
    restored 2026-08-05) — but no caller passes it, and
    `featured-events.json` is empty. Wire the callers, then the owner has a
    phone-editable lever over what leads /events.

14. **WIRE — search-gap telemetry never improves public search.**
    `searchGaps.ts` (privacy-safe by design) feeds only /admin/data-gaps.
    Wants: zero-result suggestions, Ask fallbacks. Needs an owner-curation
    gate before any raw query text is shown publicly.

## Tier 3 — the big decision

15. **DECIDE (owner) — the native-menu subsystem.** ~2,400 lines + 4 Postgres
    tables (menu_sources/native_menus/menu_sections/menu_items), a full read
    layer with evidence scoring, a 981-line ingest, and a 704-line renderer —
    zero wiring, no writer, no reader. Deleted in the 2026-08 dead-code sweep
    (git history preserves all of it; the DB tables remain in schema.ts).
    Rebuild when a restaurant pilot exists (pairs with task #35's claim
    flow); the Ask dietary answers would be the killer consumer.

## Tier 4 — remaining orphans (cut candidates, not yet cut)

- `/api/signals` — public JSON API nobody calls; /signals imports the loader
  directly. Keep only if we mean it as an open-data endpoint; then say so.
- `/api/overlays/[layer]` — whitelist is county-boundary only and the map
  imports the JSON directly, BUT data/sources.yaml's census-boundary entry
  claims this route is load-bearing. Reconcile before cutting.
- `/api/ingest/{all,arcgis,celebrate,county,seed}` — manual ops routes, no
  scheduler entries. Owner: still used by hand?
- `mdHistoricPlaces.ts`, `openBreweryDb.ts` — zero product callers; kept
  alive only by scripts/lib/data-tool-status.ts. Cut with a status-registry
  update, or wire openBreweryDb into /beer.
- Vestigial Postgres tables with zero code references: civicAlerts,
  eventCanonicalRecords, eventSourceIdentities, eventSlugAliases,
  eventTombstones, placeSpatialSyncState (superseded by ingested_events).
  Dropping tables is a migration decision, not a code sweep.

## Tier 5 — field-level drops

- `primary_type_display` (Google's human-readable category) sits in
  `places-enrichment.json` for 2,434 places, never reaches a surface.
- `narratePlanWithClaude` (`planner.ts:962`) exported, never called;
  `Plan.narrative` is always undefined.
- `place.amenities`/`accessibility` — 0 of 2,348 discovered rows populate
  them; the real amenity path is finding 7.
- Amenity kind `pool` registered with 0 points; restrooms have only 7 points
  countywide (worth a data errand, not code).
- `local-favorites.json` picks/exclude — empty editorial override, same
  family as finding 13.

## Excluded on purpose

/admin/radar stays admin-only (owner decision). Scanner medical/personal
filtering is untouchable. `schema.places`/`schema.events` write-only status
is documented in CLAUDE.md. `/api/deck` → CompassHub and `scanner_incidents`
→ scannerPatterns are live. `cofParcels`, `fcRecLocations`,
`fcFoodTruckRoster` are licensing-gated, not wiring gaps. Pulse road travel
times and the scanner↔travel-time join shipped separately (tasks #82, #85).
