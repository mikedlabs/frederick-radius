# Radius Map Findings Engine

**Status:** First client-side slice implemented on 2026-07-22. The source-registry and server finding service remain the next data-platform work.

## Product decision

Frederick Radius should not become a map with more switches. Its advantage is the ability to connect local facts that a person would not think to search together, then show the connection on the map with its evidence.

The primary interaction is **Read this area**:

1. Radius evaluates the current viewport and time.
2. It suppresses findings that do not have enough factual support.
3. It returns a short, diverse set of connections instead of another result list.
4. Selecting one draws a small constellation and fades unrelated place pins.
5. The card explains why it appeared and names the sources behind the facts.

The read is camera-honest: every participating point must be inside the
settled viewport, and ranking starts at the viewport center rather than the
device location. Support layers opened by a finding are temporary render
state. Closing the finding restores the user's saved layer choices exactly.

The machine may propose relationships. Deterministic rules must verify them. Sources must prove them.

## What shipped in the first slice

`src/components/map/mapDiscoveries.ts` currently builds five factual recipes from data already in the map payload:

- An event connected to a nearby food stop, parking garage, or transit stop.
- A park or trail connected to the nearest mapped practical amenities.
- A brewery connected to nearby food plus an event or transit stop.
- A compact cluster of different useful stops in a county town.
- County cemetery records connected to the owner's geotagged seasonal aerial archive.

The engine uses literal distances and published event times. It does not claim that a business will be open later, that an amenity does not exist when it is not mapped, or that a straight-line connection is a route.

Evidence retains inspectable source links where the upstream record has one.
OpenStreetMap records are credited to OpenStreetMap contributors and link to
their node, way, or relation. Radius field mapping is labeled separately and
is never passed off as OpenStreetMap. Historical findings also expose whether
the county point is recorded or approximate and show the real aerial capture
date when one exists.

The County historic GeoJSON file is not registered as a second "Historic
places" layer. It overwhelmingly duplicates the first-class Cemeteries layer,
which remains the one map control and one source of cemetery points. The
legacy endpoint stays county-scoped defensively, but must not be advertised as
a separate inventory.

The next version should move synthesis behind a slim server endpoint. The browser should receive findings, not every future raw dataset.

## Canonical fact contract

Every source should retain the fields below through ingestion, joining, ranking, and rendering:

```ts
type MapFact = {
  id: string;
  kind: string;
  geometry: GeoJSON.Geometry;
  title: string;
  facts: Record<string, string | number | boolean>;
  validFrom?: string;
  validUntil?: string;
  observedAt?: string;
  expiresAt?: string;
  source: string;
  sourceUrl?: string;
  confidence: "official" | "verified" | "curated" | "community" | "prediction";
  precision: "exact" | "approximate" | "area";
  license: string;
  joinKeys: string[];
  actions: Array<{ label: string; href: string }>;
};
```

The current map flattens several feeds too early. CHART loses severity, lanes, dates, and descriptions. SeeClickFix loses status, category, time, and its source URL. USGS gauges lose their readings and trend. TransIT stops lose the IDs required by the existing prediction endpoint. Those are data-contract defects, not visual-design defects.

## Finding eligibility and ranking

A finding is eligible only when:

- Its required coordinates are valid and precise enough for the claim.
- Every required fact is inside its own freshness window.
- Its source and reuse terms are approved.
- Its wording stays within what the source actually proves.
- It offers a useful interpretation or action.
- It contains at least two connected facts.

Confidence is the weakest required fact, never the average. A fresh event cannot make stale parking data trustworthy.

Eligible findings should rank on relevance to the viewport or route, timeliness, Frederick-specific value, spatial coherence, evidence strength, and novelty. Diversity runs after scoring so the first screen does not become six versions of the same event card.

## Four flagship lenses

These should be user-facing lenses over the same fact graph, not new pages full of filters.

### Right now

Join NWS conditions, AirNow, events, opening hours, live transit, road conditions, parking, and public amenities. This lens should change its answer when heat, air quality, flooding, or severe weather makes the obvious outdoor option a poor fit.

### Hidden Frederick

Join Library of Congress imagery, historic topographic maps, public Maryland Historical Trust records, county cemeteries, current structures, and the owner's aerial archive. Every historical image retains its date, rights statement, location confidence, and public-access status.

### Move without a car

Join GTFS-RT, the existing stop-prediction endpoint, sidewalk and curb-ramp records, terrain grade, crossings, weather, venue hours, and the final return trip. Planning-grade walkability data may describe recorded infrastructure; it must not guarantee that a route is accessible or currently passable.

### Water and weather

Join USGS observations, NOAA river forecasts, NWS alerts, radar, FEMA flood context, local high-water points, road closures, parks, and trails. Radius may explain observations and official warnings. It must not independently declare a trail or road safe.

## Highest-leverage official sources

| Source | Grain and use | Required caution |
| --- | --- | --- |
| [Frederick County GIS REST catalog](https://fcgis.frederickcountymd.gov/server_pub/rest/services) | Parcels, roads, parks, public safety, planning, transit, utilities, and asset inventories. | A readable ArcGIS service is not automatically a commercial reuse license. Obtain written permission for caching, transforming, and redistributing County layers. |
| [County Parks assets](https://fcgis.frederickcountymd.gov/server_pub/rest/services/ParksAndRecreation/Assets/MapServer) | Benches, trees, lights, playground assets, amenities, condition fields, inspections, and attachments. | Preserve inspection dates and avoid presenting old condition data as current. |
| [County DPW Walkability](https://fcgis.frederickcountymd.gov/server_pub/rest/services/DPW/Walkability/MapServer) | Sidewalk segments, curb ramps, and recorded noncompliance. | This is planning data, not a guarantee that a route is passable. |
| [TransIT GTFS schedule](https://passio3.com/frederick/passioTransit/gtfs/google_transit.zip), [trip updates](https://passio3.com/frederick/passioTransit/gtfs/realtime/tripUpdates), and [vehicles](https://passio3.com/frederick/passioTransit/gtfs/realtime/vehiclePositions) | Scheduled and near-real-time bus service. | Retain feed timestamps and distinguish schedules from observations. |
| [Maryland iMAP catalog](https://imap.maryland.gov/api/search/definition/) | Machine-readable statewide discovery of new datasets and services. | Evaluate the record-level license and attribution before activation. |
| [NWS API](https://www.weather.gov/documentation/services-web-api) and [AirNow](https://docs.airnowapi.org/webservices) | Forecast grids, lifecycle alerts, hourly AQI observations, and daily AQI forecasts. | AirNow values, colors, agency credit, and preliminary-data notice must remain intact. |
| [USGS Water Data](https://api.waterdata.usgs.gov/) and [NOAA NWPS](https://api.water.noaa.gov/nwps/v1/docs/) | Gauge observations, histories, trends, and river-reach forecasts. | Show the observation time, provisional status, station, and agency. |
| [USGS National Map](https://www.usgs.gov/the-national-map-data-delivery/gis-data-download) | LiDAR, elevation, hydrography, trails, imagery, and structures. | Cite the product and vintage. Derived slope and viewshed results must be labeled as analysis. |
| [FEMA NFHL](https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer) | Effective flood maps and revisions. | Never present the layer as an insurance, survey, or engineering determination. |
| [Library of Congress APIs](https://www.loc.gov/apis/) | Historic photographs, maps, item metadata, and IIIF images. | Rights are item-specific. Prefer Free to Use and Reuse items and preserve every rights statement. |

## Existing data to stop wasting

Before acquiring more sources, preserve the facts already present:

- Restore TransIT stop IDs and make a stop open the existing live-prediction route.
- Keep full CHART and SeeClickFix facts through the map payload.
- Keep USGS readings, trend, observed time, and official thresholds on gauge features.
- Integrate the County recreation asset feed only after reuse permission is confirmed.
- Keep the first-class cemetery inventory county-scoped; do not register the same records again as "Historic places." Keep Public art disabled until reviewed pieces exist.
- Group co-located events instead of silently keeping only one.
- Replace blanket spatial deduplication with source IDs and asset-specific tolerances.
- Repair `data/sources.yaml` so runtime status, endpoints, licenses, and freshness match the code that actually ships.

## AI's role

AI is useful offline for document extraction, entity matching, archival image tagging, agenda parsing, and proposing candidate joins. It may translate a verified finding into plain language after the underlying facts are locked.

AI must not invent map facts, decide that a route is safe, infer accessibility from a photograph, infer that a planning application will be approved, or expose sensitive locations. Runtime answers should be reproducible from stored facts and rules.

## Privacy and safety

- Keep exact device location in the browser whenever possible.
- Do not build movement histories or infer home, work, health, or personal traits.
- Do not expose medical calls, residences, sensitive archaeological locations, vulnerable wildlife locations, faces, license plates, or detailed sensitive infrastructure.
- Label predictions as predictions and area-level data as area-level.
- Say “nearest mapped” wherever coverage is incomplete.
- Expire and moderate community reports.

## Delivery order

1. Finish the shared fact contract and correct field loss in existing feeds.
2. Connect the existing trust-gated impact engine to event findings.
3. Add the server findings endpoint with viewport, time, intent, and privacy-rounded location inputs.
4. Ship Right now using NWS, AirNow, opening hours, travel, transit, and parking.
5. Restore stop IDs and ship Move without a car.
6. Get written County and City data reuse terms before activating asset-level GIS caches.
7. Index approved Lightroom EXIF and keywords, then ship Hidden Frederick with archival rights metadata.
8. Add field-verification missions based on coverage gaps, always phrased as “not mapped yet.”

## Success measures

Track finding impressions, opens, source reveals, action taps, saves, shares, and “not useful.” Also track suppressions by reason. A system that produces many cards but few useful actions is failing, even if the map looks impressive.
