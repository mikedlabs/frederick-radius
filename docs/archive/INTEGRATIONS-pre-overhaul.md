# Integrations

Every external API the app calls. Working rule 6. Cost and rate limits
are stated where known. There is no analytics or cost observability
wired yet, so usage volume is not measured. That gap is itself an open
item. Every integration degrades gracefully: a missing key or a failed
fetch hides the feature, it does not break the page.

| Integration | Module | Env key | Cost | Rate / cadence | Fallback |
|---|---|---|---|---|---|
| OpenFreeMap tiles | components/map | none | Free | Per map view | MapLibre shows the base with palette only |
| Google Places | integrations/google-places | GOOGLE_PLACES_API_KEY | Paid, billed per field mask | On enrich, cached 7 days | Static enrichment JSON, then nothing |
| Google Routes | integrations/google-routes | GOOGLE_PLACES_API_KEY | Paid, computeRouteMatrix | On travel-time request | Haversine estimate |
| OpenStreetMap Overpass | integrations/overpass | none | Free, shared instance | On map load, session-cached | Curated places only |
| SeeClickFix 311 | integrations/seeclickfix | none | Free public | Pulse + cron | Section hides |
| MDOT CHART | integrations/mdot-chart | none | Free public | Pulse + cron | Section hides |
| FirstEnergy outages | integrations/firstenergy | none | Free, unofficial JSON | Pulse | Section hides |
| FCPS alerts | integrations/fcps | FCPS_FEED_URL | Free RSS | Pulse | Section hides |
| PulsePoint | integrations/pulsepoint | PULSEPOINT_AGENCY_ID | Free, reverse-engineered | Pulse | Section hides until a valid agency id |
| NWS weather | integrations/nws, nws-alerts | none | Free public | Today | Weather strip hides |
| AirNow AQI | integrations/airnow | AIRNOW_API_KEY | Free, key required | Today | Badge hides |
| NPS | integrations/nps | NPS_API_KEY | Free, key required | Trails | Hides |
| Hood College | integrations/hood | HOOD_CALENDAR_URL | Free iCal | Events | Hood section hides |
| Live iCal (DFP, Celebrate, County) | integrations/ical-live | none | Free | Events, request-time | Static seed events |
| Reddit r/FrederickMD | integrations/reddit | none | Free public RSS | Explore | Strip hides |
| Local news | integrations/news | none | Free RSS | Explore | Strip hides |
| ArcGIS (county GIS) | integrations/arcgis | none | Free public | Ingest | Skipped |
| Wikimedia | integrations/wikimedia | none | Free | Photo fallback | Designed gradient placeholder |
| Anthropic (planner) | integrations/planner | ANTHROPIC_API_KEY | Paid per token | On plan request | Heuristic plan |
| Cron auth | api/ingest/_auth, api/cron/* | CRON_SECRET | n/a | Vercel cron | Route returns 401/500 |

## Crons (vercel.json)

- `/api/ingest/all` daily 09:00. Live iCal ingest.
- `/api/ingest/civicengage` daily 08:00. Municipal events.
- `/api/cron/data-health` daily 09:30. Recomputes dedup, copy, and hours
  coverage and reports them. It does not write the committed artifacts;
  serverless storage is read-only. The artifacts regenerate at build
  time via `npm run dedup` and `npm run copy:scores`.

## Open per the Checkpoint 1 decision

Not yet integrated, deferred to their gating phases with keys to be
provided: Mapbox, deck.gl tiles, PredictHQ, Algolia or Typesense,
Geocodio, Stripe, Twilio, SafeGraph or Placer, Cloudinary or Imgix,
Google Civic Information, Open States, Eventbrite, Ticketmaster,
Bandsintown, TransIT GTFS.
