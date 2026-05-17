# Frederick Radius Data Pipeline, Phase 0 Plan

Status: Phase 0 only. This document is the audit and the build plan. No pipeline code has been written. Per the setup spec, work stops here until you approve this plan.

Branch: `data-pipeline`, taken from `main`. It is fully separate from the P0 trust work on PR #9, so the two never tangle.

## 1. Stack choices

The repository is Next.js 16 with TypeScript 5. There is no Python. Per the spec, the worker is built in the same stack for continuity.

- Language: TypeScript, run with `tsx`, which is already a dev dependency used by the existing `scripts/` directory.
- Manifest: `data/sources.yaml`, parsed with the `yaml` package. This package is not yet installed and will be added.
- Schemas: JSON Schema Draft 2020-12 in `schemas/`, plus Zod runtime validators in `pipeline/schemas_ts/`. Zod is not yet installed and will be added.
- Transforms: deterministic TypeScript modules in `transforms/`, no network and no model calls.
- Scheduling: two GitHub Actions workflows. Raw snapshots are committed to a `data-snapshots` branch, never to `main`.

New dependencies required: `zod`, `yaml`. Both are small, widely used, and runtime safe.

## 2. Existing data sources found

The audit scanned `src/lib/integrations/`, `src/lib/ingest/`, `src/app/api/`, `scripts/`, every `process.env` reference, and every external URL. Twenty four active in-code sources were found, grouped below. Cadence values are proposed starting points, not yet confirmed against each provider.

### GIS and boundaries

| id | code | endpoint | type | key |
| --- | --- | --- | --- | --- |
| frederick_county_arcgis | integrations/arcgis.ts | maps.frederickcountymd.gov/arcgis/rest/services | arcgis_rest | no |
| md_imap_arcgis | integrations/arcgis.ts | geodata.md.gov/imap/rest/services (parcels, physical boundaries, state parks) | arcgis_rest | no |

### Places and business

| id | code | endpoint | type | key |
| --- | --- | --- | --- | --- |
| osm_overpass | integrations/overpass.ts | overpass-api.de/api/interpreter, plus two mirrors | overpass | no |
| open_brewery_db | integrations/openBreweryDb.ts | api.openbrewerydb.org/v1 | rest_json | no |
| google_places | integrations/google-places.ts | places.googleapis.com/v1 | rest_json | yes, GOOGLE_PLACES_API_KEY |
| wikimedia_commons | integrations/wikimedia.ts | commons.wikimedia.org | rest_json | no |

### Events and calendars

| id | code | endpoint | type | key |
| --- | --- | --- | --- | --- |
| dfp_events | integrations/ical-live.ts, api/ingest/dfp, scripts/scrape-dfp.mjs | downtownfrederick.org events and vibemap sitemaps | ical and scrape | no |
| celebrate_frederick | integrations/ical-live.ts, api/ingest/celebrate | celebratefrederick.com/calendar-of-events | ical | no |
| hood_college | integrations/hood.ts | trumba.com/calendars/hood-college-events.ics, via HOOD_CALENDAR_URL | ical | no |
| frederick_county_calendar | api/ingest/county, api/ingest/civicengage | frederickcountymd.gov/RSSFeed.aspx | rss | no |

### Weather and environment

| id | code | endpoint | type | key |
| --- | --- | --- | --- | --- |
| nws_forecast | integrations/nws.ts | api.weather.gov | rest_json | no |
| nws_alerts | integrations/nws-alerts.ts | api.weather.gov alerts | rest_json | no |
| airnow | integrations/airnow.ts | airnowapi.org/aq/observation/latLong/current | rest_json | yes, AIRNOW_API_KEY |

### Civic, safety, and infrastructure

| id | code | endpoint | type | key |
| --- | --- | --- | --- | --- |
| mdot_chart | integrations/mdot-chart.ts | chart.maryland.gov/Incidents/GetIncidents | rest_json | no |
| seeclickfix | integrations/seeclickfix.ts | seeclickfix.com/api/v2/issues | rest_json | no |
| pulsepoint | integrations/pulsepoint.ts | web.pulsepoint.org/DB/giba.php | scrape | agency id |
| firstenergy_outages | integrations/firstenergy.ts | outages-mdwv.firstenergycorp.com report.js | scrape | no |
| nps | integrations/nps.ts | developer.nps.gov/api/v1 | rest_json | yes, NPS_API_KEY |
| fcps_news | integrations/fcps.ts | fcps.org/news.rss, via FCPS_FEED_URL | rss | no |

### News and social

| id | code | endpoint | type | key |
| --- | --- | --- | --- | --- |
| google_news_rss | integrations/news.ts | news.google.com/rss/search | rss | no |
| reddit_frederick | integrations/reddit.ts | reddit.com/r/Frederick/top.rss, OAuth optional | rss and oauth | optional |

### Geocoding and routing, used on demand rather than batched

| id | code | endpoint | type | key |
| --- | --- | --- | --- | --- |
| google_geocode | ingest/geocode.ts | maps.googleapis.com/maps/api/geocode/json | rest_json | yes |
| google_routes | integrations/google-routes.ts | routes.googleapis.com/distanceMatrix/v2 | rest_json | yes |

## 3. Excluded, not pipeline sources

These were found in the audit but are not fetch and validate sources, so they get no manifest row. They are listed for completeness.

- `integrations/deeplinks.ts` builds outbound links for Apple Maps, Google Maps directions, Waze, DoorDash, Grubhub, Uber Eats, OpenTable, Resy, ParkMobile, Facebook, and Instagram. These are link builders, not data feeds.
- `api.anthropic.com` in `integrations/planner.ts` is an optional narrative model call, not a data source.

## 4. Candidate sources for the discover command

These are named in the project notes but are not wired in code today. They are good candidates for the `discover-sources` agent command and would be added to `sources.yaml` with `status: pending_approval`, never activated automatically.

Maryland Socrata Open Data, Frederick County Open Data Hub on ArcGIS, Frederick County TransIT GTFS via Transitland, MTA MARC GTFS realtime, Visit Frederick events, Google Civic Information, Ticketmaster, Yelp Fusion (a YELP_API_KEY is present but no integration file was found), Foursquare, Maryland DNR Trail Atlas, US Census ACS, USGS Water Services, FEMA flood maps.

## 5. Proposed directory structure

```
data/
  sources.yaml                 single source of truth, one row per source
  raw/{id}/{YYYY-MM-DD}.json    raw snapshots, on data-snapshots branch only
  clean/{id}.geojson | .json    normalized output the app can later consume
  README.md
schemas/                       JSON Schema Draft 2020-12, one per source
transforms/                    one deterministic .ts transform per source
pipeline/
  fetch_all.ts                 daily worker
  freshness_check.ts           weekly cadence check
  schemas_ts/                  Zod runtime validators, one per source
.github/workflows/
  data-refresh.yml             daily at 10:00 UTC, manual dispatch enabled
  freshness-check.yml          weekly on Mondays
AGENTS.md                      audit-sources, discover-sources, diagnose-failure
```

Two scripts will be added to `package.json`: `pipeline:fetch` and `pipeline:freshness`.

## 6. Build sequence after approval

Phases 1 through 7 from the spec, built in one pass once approved: the manifest, the schemas, the transforms, the daily worker, the two workflows, the AGENTS.md command contracts, and the data README. The worker will be run once locally and three sources verified end to end before any pull request is opened.

## 7. Decisions needed before I build

The spec asks me to flag anything ambiguous. These five points need your call.

1. Coexistence. I recommend the pipeline writes to `data/clean/` and the app keeps reading the current `src/data/*` files unchanged. Rewiring the app to read pipeline output is a separate, later, reviewed change. Confirm this boundary.
2. Scrape-class sources. `dfp_events`, `firstenergy_outages`, `pulsepoint`, and the HTML and RSS county feeds are scrapes, not stable APIs. They break more often than clean APIs. I recommend including them with `endpoint_type: scrape` and lenient validation, accepting that they will generate most of the failure noise. Confirm, or keep scrapes out of the daily worker and run them manually.
3. PulsePoint. This is public-safety incident data. The project notes themselves call for strict privacy review on public-safety layers. I recommend `status: pending_review` and excluding it from the worker until you explicitly approve it. Confirm.
4. Source list. Confirm the twenty four active sources in section 2 are correct, and tell me which candidates in section 4 you want seeded now as `pending_approval`.
5. Delivery. This is its own branch and will become its own pull request, separate from PR #9. Confirm.

Nothing else will be built until you approve this plan.
