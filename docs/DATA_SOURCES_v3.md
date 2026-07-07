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

## Genuine gaps — not yet built (ranked)

1. **EV charging (authoritative).** No dedicated integration today (only OSM
   crowd-sourced chargers via `overpass.ts`). Audit Must-have.
   - MD iMAP EV FeatureServer: `mdgeodata.md.gov/imap/rest/services/Transportation/MD_AlternativeFuel/FeatureServer/2/query?where=City='Frederick'`
   - NREL AFDC: `developer.nrel.gov/api/alt-fuel-stations/v1.json?state=MD&fuel_type=ELEC` (free key, better radius search)

2. **MD DNR state-park open/closed status.** Have federal (NPS) + trout, not
   state-park status (Cunningham Falls, Gambrill, Greenbrier, South Mountain).
   - `dnr.maryland.gov/Pages/park-status-dashboard.aspx` (HTML/JS, JSON underneath — confirm endpoint)

3. **Wikidata + Wikipedia GeoSearch context.** `wikimedia.ts` exists but does
   not do GeoSearch/SPARQL. A "what am I looking at" landmark panel.
   - Wikidata SPARQL: `query.wikidata.org/sparql` (county `wd:Q501345`, CC0)
   - Wikipedia GeoSearch: `en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=LAT|LNG&gsradius=1500` (CC BY-SA)

4. **Overture Places gap-fill.** Incremental over existing OSM/Overpass — catch
   POI gaps in outer towns (Brunswick, Emmitsburg, Woodsboro, Rosemont).
   - `s3://overturemaps-us-west-2/release/*/theme=places` (GeoParquet, monthly)

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
