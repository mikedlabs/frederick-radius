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
| Bandsintown | `BANDSINTOWN_APP_ID` | Live music by tracked artists | artists.bandsintown.com API (request an app id) |
| SeatGeek | `SEATGEEK_CLIENT_ID` | Ticketed concerts/shows near Frederick | seatgeek.com/account/develop |
| Eventbrite | `EVENTBRITE_TOKEN` | Events from the curated organizer registry | eventbrite.com → Developer → personal OAuth token |
| Google Places | `GOOGLE_PLACES_API_KEY` | Place details, photos, hours, nearby | console.cloud.google.com (Places API) |
| Mapillary | `MAPILLARY_TOKEN` | Street-level imagery + litter points | mapillary.com/dashboard/developers |
| AirNow | `AIRNOW_API_KEY` | Air-quality index | docs.airnowapi.org |
| NPS | `NPS_API_KEY` | Park alerts + events (Catoctin, Monocacy) | nps.gov/subjects/developer |
| Hood College | `HOOD_CALENDAR_URL` | Hood events calendar | a working public iCal URL (the old Trumba one is HTTP 410 — see below) |
| FCPS | `FCPS_FEED_URL` | Frederick County Public Schools calendar | district calendar export URL |
| PulsePoint | `PULSEPOINT_AGENCY_ID` | Live fire / EMS incidents | PulsePoint agency id for Frederick County |

Keyless feeds (County GIS, USGS, NWS, Overpass, MDOT CHART, SeeClickFix, news
RSS, MD Farmers Markets, TransIT, MARC, the per-venue iCals) need no secret and
are live wherever outbound network is allowed.

## Held / broken calendars — verified 2026-06-20

Status re-checked this date from a networked environment, app-style fetch:

- **FCPL (library) — reachable, build pending.** The bounded iCal is unusable
  (1,700+ VEVENTs, times out the 8s live budget), but the JSON feed
  `https://frederick.librarycalendar.com/events/feed/json` answers **200,
  ~2.2 MB of `lc_event` items**. It's the #1 county-wide content target. Right
  home is the **daily cron-ingest** (`/api/ingest/all`), not live fetch — parse
  the JSON into the ingested store under the kept `fcpl` source key. This is the
  recommended next build.
- **DFP (Downtown Frederick Partnership) — still broken.**
  `downtownfrederick.org/events/?ical=1` returns **HTML, not iCal** (no Tribe
  export). Stays gated off; DFP events still flow via the daily ingest path.
- **Hood College — needs a URL.** The old Trumba calendar is HTTP 410; common
  guesses (`hood.edu/calendar.ics`, `events.hood.edu`) 404. Supply a real one
  via `HOOD_CALENDAR_URL` once found — no code change needed.
- **Mount St. Mary's — bot-walled.** `calendar.msmary.edu` returns a **202
  challenge interstitial** (not real ICS) regardless of User-Agent, so it can't
  be verified or wired without a proxy/partnership. Source key kept for when a
  reachable feed appears. (This is the Emmitsburg event gap.)

To enable a keyed feed: set its env var in Vercel → redeploy → confirm it flips
to green on `/admin/data-health`.
