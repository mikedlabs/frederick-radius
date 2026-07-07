# Data Sources v3 — audit reconciled against the codebase

Owner-provided data-source catalog (`Frederick_Radius_Data_Sources_v3.xlsx`,
July 2026), reconciled against what is actually wired in `src/lib/integrations`.
The workbook was compiled from the visible `/today` + `/trust` surfaces, so it
undercounts integrations that exist but aren't surfaced there. This file records
what's already built vs the genuine gaps, so we don't rebuild what exists.

## Already shipped (audit lists as gap/gem, but present in repo)

| Audit item | In repo |
|---|---|
| Live transit GTFS + realtime (audit: "Missing") | `transitRealtime.ts`, `transitFrederick.ts`, `transitNextStop.ts` |
| USGS river gages (audit: "Missing") | `usgsWater.ts`, `floodStage.ts`, `/rivers` page |
| AirNow AQI (audit: "Missing") | `airnow.ts`, surfaced on `/pulse` |
| FixIt / SeeClickFix Open311 (audit: "Partial") | `seeclickfix.ts`, on the map |
| Ticketmaster / SeatGeek / Bandsintown / Eventbrite | `ticketmaster.ts`, `seatgeek.ts`, `bandsintown.ts`, `eventbrite.ts` |
| USDA / MD farmers markets | `mdFarmersMarkets.ts`, `farmersMarkets.ts` |
| MD Inventory of Historic Properties + historic sites | `mdHistoricPlaces.ts`, `historicSites.ts` |
| NPS (Catoctin/Monocacy) | `nps.ts` |
| Census town facts | `/pulse` |
| Sunrise/sunset | `sun.ts`, `almanac.ts` |
| MDOT CHART, MARC trains, FAA TFR, DNR trout, FirstEnergy outages, PulsePoint, Mapillary, Hood, Visit Frederick, FCPS | respective files in `src/lib/integrations` |
| County GIS (parks/trails/rec/streets) | `fcGis.ts`, `fcParks.ts`, `fcTrails.ts`, `fcParkLocations.ts`, `fcRecLocations.ts` |
| Brewery roster cross-check | `openBreweryDb.ts` |

## Genuine gaps — build status

1. **EV charging (authoritative). ✅ BUILT (2026-07).**
   `src/lib/integrations/evCharging.ts` — MD iMAP EV FeatureServer (keyless
   ArcGIS), gated to the county ring, hydrated into the map's `ev_charging`
   amenity layer (replaces OSM when present, OSM fallback on failure).
   - MD iMAP EV FeatureServer layer 2 (no County field → bbox envelope + ring gate).

2. **Wikipedia GeoSearch context. ✅ BUILT (2026-07).**
   `src/lib/integrations/wikiContext.ts` + `components/places/NearbyContext.tsx`
   — "Around here" section on place pages, Suspense-streamed, CC BY-SA credited.
   (Wikidata SPARQL enrichment not added — GeoSearch alone answers the
   "what am I looking at" need; SPARQL is a future add for structured facts.)

3. **MD DNR state-park open/closed status. ⛔ BLOCKED — needs a confirmed endpoint.**
   The park-status dashboard is a SharePoint page embedding an ArcGIS dashboard;
   no public FeatureService/JSON endpoint is discoverable (ArcGIS Online search +
   item lookups returned nothing). The audit itself marked this "Needs check."
   Not shipping a guessed endpoint (would risk wrong open/closed data).
   - Reliable subset already live: NPS closures/alerts for Catoctin + Monocacy
     (federal) surface on /today via `getNpsAlerts` + `CivicAlerts.tsx`.
   - To unblock: find the dashboard's backing FeatureService (network tab on
     `dnr.maryland.gov/Pages/park-status-dashboard.aspx`) or a DNR park-alerts API.

4. **Overture Places gap-fill. ✅ BUILT as a review-queue pipeline (2026-07).**
   Two-step, no auto-merge (matches scripts/discover-places.ts discipline):
   - Offline pull: `overturemaps download --bbox=-77.70,39.265,-77.15,39.745 -f geojson --type=place -o /tmp/overture-frederick.geojson`
   - Diff: `npm run discover:overture -- --in /tmp/overture-frederick.geojson`
   `scripts/overture-candidates.ts` + pure `src/lib/overture/candidates.ts`
   (7 tests) normalize + county-ring-gate the Overture rows, subtract anything
   already curated via the app's own `isSamePlace`, self-dedupe, and write
   `src/data/overture-candidates.json` grouped by town (outer-town gap first).
   NOTHING is added to the app — the owner hand-vets the queue.

### Minor / optional
- MD iMAP Hospitals FeatureServer + CMS star ratings (only OSM/Google today).
- MDOT roadside historical markers ("markers near me" walking tour).
- USDA market ENRICHMENT (season dates, SNAP/WIC) onto existing market records.
- POI gap-fill alternates: Foursquare OS Places, GNIS gazetteer.
- Nature-happening-now (iNaturalist, eBird), Recreation.gov RIDB campgrounds — niche.

## Notes
- Licensing: OSM = ODbL (attribution + share-alike), Wikidata = CC0, Wikipedia =
  CC BY-SA, most gov/federal APIs = public domain. Attribute per source.
- Suggested build order from the audit: EV + DNR park status are the cleanest
  high-value adds that fit the existing "live signals" architecture.
