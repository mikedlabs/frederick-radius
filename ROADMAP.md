# Frederick Radius — Roadmap

**Last updated:** 2026-05-26 by the dev team during the Phase 1 doc refresh.
**Cadence:** updated when a phase ships or scope shifts. Companion to [`AUDIT.md`](./AUDIT.md).

This is the honest list. No vague "soon." Three columns:

- 🟢 **Shipping** — live in production, working as intended
- 🟡 **Scaffolded / partial** — wired but not delivering full value yet (env var missing, half-built, awaiting decision)
- ⚪ **Not yet built** — claimed in the brief or implied by other features but no code

---

## Current focus — five-phase polish push

The architecture overhaul (Pushes 1–7) shipped May 26. The next work is making that architecture feel premium and trustworthy.

| Phase | What it does | Status |
|---|---|---|
| **1. Audit + docs** | This document set. Honest state-of-the-app. | 🟢 In flight (this PR) |
| **2. Trust pass** | Shimmer loading states everywhere · honest empty states · verified-time chips · graceful fetch-failure copy | ⚪ Next |
| **3. Premium cards + buttons** | Consolidate the 12 card variants into 4 with density prop · canonical `<Button>` component · CSS token cleanup | ⚪ After Phase 2 |
| **4. Connectedness** | Cross-link event ↔ nearby food ↔ parking ↔ walkable · place sheets show "what's near this" map · town pages link to category-filtered surfaces | ⚪ After Phase 3 |
| **5. Snappiness** | Image audit · RSC streaming on /now · service-worker cache strategy · Web Vitals measurement before/after | ⚪ After Phase 4 |

---

## Data + integrations

| Source | Status | Next move |
|---|---|---|
| Google Places enrichment | 🟢 3,442 enriched records (photos · hours · ratings) | One-time job, complete |
| NWS weather + alerts | 🟢 Hourly + 7-day forecast + active alerts | Stable |
| Celebrate Frederick (iCal) | 🟢 Live | Stable |
| Frederick County RSS | 🟢 Live (civic rows filtered) | Consider a "civic" opt-in lens |
| Hood College Trumba | 🟢 Live | Stable |
| Weinberg Center | 🟡 Scaffolded · needs `WEINBERG_CALENDAR_URL` | Email Weinberg: "Do you publish a public iCal?" |
| Delaplaine Arts Center | 🟡 Scaffolded · needs `DELAPLAINE_CALENDAR_URL` | Same — email Delaplaine |
| Ticketmaster | 🟡 Wired · inert without `TICKETMASTER_API_KEY` | Request free dev key |
| Bandsintown | 🟡 Wired · needs `BANDSINTOWN_APP_ID` AND a curated artist list | Lower priority; manual artist list is tedious |
| Visit Frederick | ⚪ Listed in source type union; not implemented | Unknown if they have iCal |
| DFP (Downtown Frederick Partnership) | 🟢 One-time scrape | Re-scrape cadence TBD |
| OSM amenities | 🟢 442 records (playgrounds, picnic, EV, restrooms, wifi, bike parking) | Refresh script exists |
| Mapbox isochrone | 🟢 Live | Stable |

## Features by status

### 🟢 Shipping

- 4-tab IA: Now · Browse · Plan · Saved
- Animated weather card with daypart-aware sky glyph + 12-hour curve + collapsible 7-day rows
- RightNowStrip with three direct answers (open now · starting soon · weekend bet), daypart-aware, daily rotation
- MoodTiles on /now (Eat / Outdoors / With kids → category page)
- ⌘K command palette across pages, categories, towns, places
- Vaul bottom drawer for map Layers + Place sheets
- /search as one ranked list with type-chipped rows
- Sliding active-tab indicator on BottomNav with eager prefetch
- Civic alerts (NWS + NPS) at top of /now when active
- Recently viewed places on /saved
- /events with lens chips (Tonight / Tomorrow / Weekend / This week / Free)
- /events/calendar month grid (density dots, weekend tint, today bar)
- Town pages with 3-answer spine (top places · photo mosaic · upcoming)
- /about as a 30-second pitch
- /welcome as 2-step (mood + live-here)
- ⌘K command palette
- PWA install (manifest, icons, service worker, offline page)
- Push notifications scaffolding
- Per-place OG cards via `/api/og?slug=...`
- 301 redirects from all retired routes (/today, /map, /tonight, /markets, /historic, /art, /amenities, /discover)

### 🟡 Scaffolded but inert

- Weinberg + Delaplaine live feeds (need env vars set to real iCal URLs)
- Ticketmaster integration (needs API key)
- Bandsintown integration (needs API key + artist list)
- `/business/manage/[token]` edit flow (works but no SMTP integration to email the token)
- Submit-a-place / Submit-an-event review queue (writes to DB but no admin surfaces the queue strongly enough)
- Daily push notification job (cron file exists; opt-in is wired but untested in prod)

### ⚪ Not yet built

- Card variant consolidation (PlaceCard density prop refactor)
- Canonical `<Button>` component
- Shadow + tactile token consolidation
- Image audit (consistent `next/image` usage)
- RSC streaming for /now's heavy compute paths
- Service-worker cache strategy for stale UI between deploys
- Cross-page journey threading (event → parking → coffee nearby)
- Town pages → category pages filtered by town
- Web Vitals measurement + dashboard
- AI itinerary builder (mentioned in early strategy; not committed)
- Real-time event status (cancelled / postponed surfacing)
- User accounts (currently anonymous-first via localStorage + cookies)

---

## What we will not do

- Add new top-level routes. The 4-tab IA is the IA.
- Add new editorial categories.
- Build features that don't serve the three core jobs (Now · Browse · Plan).
- Promise "AI" features that hallucinate from missing data.
- Add tracking pixels or third-party analytics beyond Plausible (cookieless) + Vercel Speed Insights.

---

## How to read this doc

If you're an editor / owner: scan the "Scaffolded but inert" list — most items need a single env var or a 5-minute outreach email, not engineering.

If you're a partner / funder: the "Shipping" list is what the live app delivers. The phases are what comes next.

If you're a dev landing here cold: start with [`AUDIT.md`](./AUDIT.md) for component + route state, then this for sequencing.
