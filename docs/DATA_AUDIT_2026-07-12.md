# Data-Source Audit — July 12, 2026

Question: "Have we used all the best data sources (incl. the City Parks & Rec
page) and other pages?" Method: a 4-agent workflow that **fetch-verified** every
candidate against the live web + the repo (the "gis.frederickco.gov is Colorado"
lesson — nothing counts unless someone actually fetched it and saw real data).

## Verdict: YES — the pipeline is already comprehensive.

11 Vercel crons, 8 ingest routes, ~60 wired integrations. Rich, surfaced places
(Baker Park, Carroll Creek, 168 worship places, etc.) + 11 live event feeds
(city, county, celebrate, fair, heritage, monocacy, msd, delaplaine, parks,
mount-airy, thurmont) + Ticketmaster/Bandsintown/venue lineups. Nearly every
"new" candidate turned out to be a duplicate, a dead-end, or a low-value civic
layer.

## The Parks & Rec page specifically
- Its data lives in **WebTrac** (`mdfrederickweb.myvscloud.com/webtrac/`, program/
  camp/facility registration). Its WAF returns **HTTP 403 to every datacenter
  fetch** (curl w/ full browser headers AND WebFetch) — not ingestable server-
  side. And calendar-scheduled classes already flow in via the City ModID=58 feed.
- The CivicPlus **Facilities** module (city parks) **duplicates** what we have —
  Baker Park / Carroll Creek / etc. are already full records in places-client.json.
- The City calendar (ModID=58) is **already wired** (source `city-frederick`).

## Verified DEAD-ENDS (do not chase)
- **WebTrac rec programs** — WAF 403 to all server fetches.
- **Legistar** (county + city meetings API) — tenant does not exist
  (`LegistarConnectionString ... not set up`). Meetings stay on the ModID=58 RSS.
- **MD Open Data (Socrata)** — does NOT host the flagship datasets (liquor
  licenses = county Liquor Board; inspections = county Health; crash data local).
- **DFP** (`DFP_ICAL_URL`) + **Hood College** (`HOOD_CALENDAR_URL`) — env-gated
  OFF; upstreams return 404 / 410 Gone. Need a new working URL to revive.
- **Mount St. Mary's** ICS — 200 to curl but 403s the app's server fetch.

## GAP TOWNS: opportunity is exhausted (all fetch-verified)
Only Frederick, Mount Airy, Thurmont have real feeds. The rest publish **no
machine-readable community events**:
- Walkersville — CivicEngage iCal resolves, but catID 25 "Community Events" = 3
  federal holidays, catID 24 "Parks & Rec" = "Water Bills Due" / "Bulk Trash",
  catID 26 = 25 council/commission **meetings**. No festivals/markets/concerts.
- Brunswick (Granicus), Middletown (vertical CMS), Emmitsburg + New Market
  (Revize AJAX, no feed), Myersville/Woodsboro (no export), Burkittsville (403,
  ~150 residents), Rosemont (no site). Confirmed: no clean feeds.

## Duplicates masquerading as gaps
- **County GIS Places of Worship** (196 pts) — we already have **168 worship
  places** + a "Churches & worship" I-want tile → /category/worship. Adding the
  GIS layer = ~196 duplicates. (The old "Faith 169→0" was a *matcher* bug, since
  fixed — not missing data.)
- **arcgis.ts FC_LAYERS** (parks/libraries/fire) → its host
  `maps.frederickcountymd.gov` 404s, the ingest route is **orphaned** (no cron),
  and the data (parks/libraries/fire) already exists. Repointing it would risk
  dups on a route that never runs. Low value.
- **civicengage ingest route** — configured for 5 towns but has **no scheduler**;
  3 of its towns overlap ical-live (dup risk if wired), and its only net-new town
  (Walkersville) is meetings/utility. Left dormant.

## Genuinely net-new, but LOWER-value / owner's call (fetch-verified, non-dup)
These are real and clean, but they're civic/preparedness reference — not core
"what's open / what's on" discovery. Held for an owner decision rather than
shipped unattended:
- **Emergency Shelters** (fcgis, 66 pts w/ generator/kitchen/capacity/handicap)
  — a /pulse preparedness card that would pair with the NWS alerts we already
  show. Reference data (not real-time activation status).
- **Polling Places + Drop Boxes** (73 + 12) — seasonal (elections) civic layer.
- **Government Facilities POI** (37) — county-run facility gazetteer.
- **County Farmers-Market POI** — has per-market Hours + season Dates that could
  PATCH the existing mdFarmersMarkets rows (enrichment, not net-new).

## Recommendation
No core data gap to fill — the best sources are already in. If the owner wants a
civic layer, the **Emergency Shelters /pulse preparedness card** is the strongest
(genuinely useful, pairs with alerts, low risk, fail-soft). Everything else is a
dup, a dead-end, or an enrichment patch.
