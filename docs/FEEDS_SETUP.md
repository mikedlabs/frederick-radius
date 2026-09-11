# Feeds setup — turning on the dark feeds

The live-feed catalog and its "is it collecting?" logic live in
`src/lib/integrations/feed-registry.ts`; `/admin/data-health` renders the
green/amber board from `feedStatuses()`. A **keyed** feed is dark until its env
var exists in the deployment (Vercel); it fails soft to empty, so the page
never breaks — it just contributes nothing until configured.

## Keyed feeds — set these in Vercel to light them up

| Feed | Env var | Unlocks | Where to get it |
| --- | --- | --- | --- |
| Ticketmaster | `TICKETMASTER_API_KEY` | Concerts + Frederick Keys home games | developer.ticketmaster.com (free Discovery API key) |
| Bandsintown | `BANDSINTOWN_ENABLED=1` and `BANDSINTOWN_APP_ID` | Live music by tracked artists | Enable only after approval is recorded in `data/sources.yaml` |
| SeatGeek | `SEATGEEK_ENABLED=1` and `SEATGEEK_CLIENT_ID` | Ticketed concerts/shows near Frederick | Enable only after approval is recorded in `data/sources.yaml` |
| Eventbrite | `EVENTBRITE_ENABLED=1` and `EVENTBRITE_TOKEN` | Events from the curated organizer registry | Enable only after approval is recorded in `data/sources.yaml` |
| Google Places | `GOOGLE_PLACES_API_KEY` | Place details, photos, hours, nearby | console.cloud.google.com (Places API) |
| Mapillary | `MAPILLARY_ENABLED=1` and `MAPILLARY_TOKEN` | Street-object detections | Enable only after the attribution/terms review is recorded in `data/sources.yaml` |
| AirNow | `AIRNOW_API_KEY` | Air-quality index | docs.airnowapi.org |
| NPS | `NPS_API_KEY` | Park alerts + events (Catoctin, Monocacy) | nps.gov/subjects/developer |
| Hood College | `HOOD_CALENDAR_URL` | Hood events calendar | a working public iCal URL (the old Trumba one is HTTP 410 — see below) |
| FCPS | `FCPS_FEED_URL` | Frederick County Public Schools calendar | district calendar export URL |
| PulsePoint | `PULSEPOINT_ENABLED=1` and `PULSEPOINT_AGENCY_ID` | Non-medical fire, rescue, and traffic incidents | Enable only after the privacy/licensing review is recorded in `data/sources.yaml`; then set the Frederick County agency id |

Keyless feeds (County GIS, USGS, NWS, Overpass, MDOT CHART, SeeClickFix, news
RSS, MD Farmers Markets, TransIT, MARC, the per-venue iCals) need no secret and
are live wherever outbound network is allowed.

## Held / broken calendars — verified 2026-06-20

Status re-checked this date from a networked environment, app-style fetch:

- **FCPL (library) — reachable, build pending.** The bounded iCal is unusable
  (1,700+ VEVENTs, times out the 8s live budget), but the JSON feed
  `https://frederick.librarycalendar.com/events/feed/json` answers **200,
  ~2.2 MB of `lc_event` items**. It's the #1 county-wide content target. Right
  home is the **daily cron-ingest** (`/api/ingest/fcpl`), not live fetch. It
  parses the JSON into the ingested store under the kept `fcpl` source key.
- **DFP (Downtown Frederick Partnership) — still broken.**
  `downtownfrederick.org/events/?ical=1` returns **HTML, not iCal** (no Tribe
  export). Stays gated off; DFP events still flow via the daily ingest path.
- **Hood College — needs a URL.** The old Trumba calendar is HTTP 410; common
  guesses (`hood.edu/calendar.ics`, `events.hood.edu`) 404. Supply a real one
  via `HOOD_CALENDAR_URL` once found — no code change needed.
- **Mount St. Mary's — bot-walled.** `calendar.msmary.edu` returns a **202
  challenge interstitial** (not real ICS) regardless of User-Agent, so it can't
  be verified or wired without a proxy/partnership. Source key kept for when a
  reachable feed appears. (This is the Emmitsburg event gap.) Re-checked
  2026-06-29: still walls a browser UA (403). Defer until a partnership or a
  reachable endpoint appears.

- **FCPS / high-school athletics — no clean public feed (spike, 2026-06-29).**
  Probed the obvious platforms; none yields a usable iCal/JSON schedule:
  - `fcps.org/athletics` routes ticketing to **GoFan** (`gofan.co/app/school/MD68111`)
    and competition info to **MPSSAA** — neither is a schedule feed.
  - GoFan API guesses (`/api/schools/<id>/events`) **404/302 to an error page**;
    its schedule data is JS-rendered behind the app shell, per-school (a separate
    code per high school), and ticketed-events-only — brittle and partial, not a
    clean feed.
  - **MPSSAA** (state association) publishes PDFs, no iCal/RSS. **MaxPreps**
    per-team pages exist but expose no feed.
  Conclusion: no reliable public source today. Revisit if FCPS adopts a
  feed-capable scheduler (rSchoolToday/Arbiter), or pursue a GoFan partnership /
  per-school rendered-calendar scrape only if HS sports becomes a priority. No
  source key reserved until a feed exists.

To enable a keyed feed: set its env var in Vercel → redeploy → confirm it flips
to green on `/admin/data-health`.
