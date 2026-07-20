# Data Source Discovery — triage (2026-07-20)

A research sweep turned up dozens of Frederick-area feeds. This file keeps the
raw finds AND a verdict on each, so we don't re-chase what's already wired or
burn effort on dead ends. Companion to `DATA_SOURCES_v3.md`.

## Verdict first

### Already wired — skip (don't rebuild)
- **NWPS flood categories + USGS gauges.** Done: `src/lib/integrations/floodStage.ts`
  compares live USGS gage height against curated NWS action/minor/moderate/major
  thresholds for the six county forecast points, surfaced on /rivers + the Pulse
  rivers tile. The doc's #1 "find" is our shipped design.
- **MDOT CHART incidents.** Wired: `src/lib/integrations/mdot-chart.ts` (Pulse
  traffic tile + /today Heads-up bridge, humanized).
- **NWS weather, PulsePoint fire/EMS, AirNow, NPS, TransIT GTFS + MARC, police
  CFS, DNR trout, news.** All already in the Pulse assembly.

### Worth doing — ranked by value ÷ effort
1. **CHART traffic cameras** (`GetCamerasJson`, keyless, verified 77KB). We have
   incidents but not cams. Live cam thumbnails on the Pulse traffic tile / /map
   are real "is it backed up right now" value. One filtered client-side call.
2. **The five Tribe/WordPress event feeds** — Maryland Ensemble Theatre (61),
   Tenth Ward (23), Linganore (19), Steeplechasers (25), Idiom — plus
   **RunSignup** races. ~130 keyless auto-refreshing events. Slots into the
   existing `unifiedEvents` iCal/JSON assembly exactly like the DFP Vibemap feed
   (PR #1271). Highest-value events win left.
3. **Photo ingest** (Wikimedia Commons geosearch + iNaturalist place 48816 +
   LOC HABS `co=hh` + NPS API for mono/cato/choh). Turns bare place pages visual
   with clean, zero-risk attribution. Store `source_id`/`license`/`attribution`/
   `credit_url` per image. Flickr is the only source needing per-photo license
   checks at ingest.
4. **iNaturalist nature layer** (215,508 obs, 8,072 species, CC photos, keyless)
   for park pages.
5. **Verified-places enrichment**: NPPES providers, FDIC banks, OpenBrewery —
   all keyless + verified. Quick cross-check / gap-fill pass.
6. **Socrata SODA** (city permits `xrz3-9xhj`, EV regs, crime) — one adapter by
   dataset id, keyless.
7. **Overture / Foursquare OS Places** — only if we want to expand the places DB
   broadly; parquet/DuckDB, not a REST call. Bigger lift.

### Dead ends — do not spend time
- Eventbrite (search killed 2019), Meetup (REST retired 2025), Bandsintown (now
  needs a real key, 403), Songkick (no new keys).
- Facebook/Instagram events — no legitimate API; do not build scrapers.
- HMdb markers, News-Post inspections — contributor-copyrighted / bot-gated.
- Heritage Frederick, MD State Archives, city PhotoShelter — permission/partner
  only, no open license.

### Keys required (defer until we want them)
Census ACS, eBird, Recreation.gov RIDB, NREL AFDC, Petfinder, Mapillary, Flickr,
NPS (DEMO_KEY works for light use), USDA Local Food Portal.

---

## Raw finds (reference)

Full endpoint list, statuses, and gotchas from the 2026-07-20 sweep are retained
below for whoever picks up an item above.

### Real-time / environmental
- NWPS flood: `https://api.water.noaa.gov/nwps/v1/gauges/{lid}` (FDKM2, PORM2). ALREADY WIRED.
- USGS water: `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=...&parameterCd=00065,00060`. ALREADY WIRED.
- CHART: `chart.maryland.gov/DataFeeds/GetIncidentJson`, `GetCamerasJson`, `GetDataFeeds`; snow `countyId=11`. Incidents wired; cameras NOT.
- KFDK METAR: `https://aviationweather.gov/api/data/metar?ids=KFDK&format=json`. TAF fallback KHGR/KMRB/KIAD.
- adsb.lol overhead: `https://api.adsb.lol/v2/point/39.4143/-77.4105/50`.
- USGS quakes: `earthquake.usgs.gov/fdsnws/event/1/query` (wide radius; seismically quiet).
- FEMA NFHL layer 28 (flood zones) — slow, cache hard.

### Government / civic
- CivicPlus RSS/iCal hubs (city + county) — `ModID`/`CID` ids need a view-source pass.
- Granicus, two tenants: city `view_id=12`, county `view_id=10`. County also on YouTube `@FrederickCountyMD`.
- Permits: OpenGov `frederickmd.portal.opengov.com`; historical Socrata `xrz3-9xhj`.
- CrimeWatch MD scrape; MD crime Socrata `2p5g-xrcb` / `jwfa-fdxs`.
- Socrata datasets: permits `xrz3-9xhj`, EV `qtcv-n3tc` / `tugr-unu9`, crashes `yhmz-gxyw`, breweries `vuup-7iwz`.
- Census geocoder (keyless): `geocoding.geo.census.gov/geocoder/...`.

### Events
- Tribe JSON `/wp-json/tribe/events/v1/events`: marylandensemble.org (61), tenthwarddistilling.com (23), linganorewines.com (19), steeplechasers.org (25, follow 302), idiombrewing.com.
- RunSignup: `runsignup.com/Rest/races?format=json&state=MD&city=Frederick&num=25`.
- Homegrown Frederick farmers markets (authoritative directory).
- Platform map (Communico, Simpleview, ActiveCalendar, WebTrac, Arbiter, etc.) — most need browser network inspection or a B2B agreement.

### Places / POI
- Overture (DuckDB, CDLA-Permissive), Foursquare OS Places (Apache 2.0, HF gate).
- Keyless verified: OpenBrewery `api.openbrewerydb.org` (post-filter `city==Frederick`), NPPES `npiregistry.cms.hhs.gov/api`, FDIC `api.fdic.gov/banks/locations`, iNaturalist place 48816.
- NPS National Register: `mapservices.nps.gov/.../nrhp_locations/MapServer` (`State='MARYLAND'`).

### Photos (CC / public domain)
- Wikimedia Commons (geosearch + categories, ~3–5k images), iNaturalist CC photos (33,336; 10,059 CC0), LOC HABS/Highsmith (~935 + 18, public domain), NPS multimedia API (mono 557, cato, choh), Flickr (per-photo license check), Openverse, Wikidata P18, Smithsonian OA, Digital Maryland (permission for commercial), Chronicling America, Mapillary (CC-BY-SA).
