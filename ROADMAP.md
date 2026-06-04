# Frederick Radius — Roadmap

**Last updated:** 2026-06-04 — added the differentiation roadmap (the moat + the love).
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

## Differentiation features — the moat + the love

> Why someone deletes Yelp/Google Maps for *this*. Not feature parity —
> the things a national app structurally cannot do for a single county.
> Sequenced; each item carries its **data-confidence gate** answer (source,
> freshness, behavior when data is missing) per `UX_REDO.md`. Items needing
> data *acquisition* (not engineering) are flagged ⛏.

### Moat 1 — Identity no competitor can fake (the "alive" layer)

| Feature | Status | Next move · gate |
|---|---|---|
| **The living radius** — reachability-as-geometry: everything within a walk/bike/drive in the time you have; the county reorganizes around the ring. The signature. | 🟡 Isochrone API live; ring components half-built. **Interactive prototype: `docs/living-radius-demo.html`.** | Wire the prototype to `/api/isochrone` + real client places; the ring doubles as the loading/brand motif. Gate: reach reflects real isochrone travel time, never straight-line dressed as a drive; origin is real geolocation or a clearly-stated assumed center. |
| **A home that's genuinely alive** — looks different at 7am vs sunset vs first snow; seasonal intelligence (foliage peak, First Saturday, creek sailboats up). | 🟡 Daypart sky + SunCountdown shipping. | Add a seasonal/event-state layer. Gate: every "it's happening" claim is sourced + dated; no faked seasonal state. |
| **Radius Stories** — short photographic local context, hyperlocal. | ⚪ (photo-forward grid #419 is the seed) | Curate a story rail. Gate: real, attributed imagery; no stock. |

### Moat 2 — Indispensable utility nobody else bothers with

| Feature | Status | Next move · gate |
|---|---|---|
| **"New here?" mover onboarding** — trash day for *your* address, library card, DMV, your councilmember, the good coffee in walking distance. The highest-loyalty moment, unserved. | ⚪ (`/welcome` is a 2-step seed) | Compose civic moat + radius + the Ask into one flow. ⛏ Needs collection-schedule + districting data. Gate: every civic fact sourced (County/City) + fresh; "not confirmed" beats a confident lie. |
| **The county heartbeat** — a "right now" pulse: live music tonight, food trucks out now, creek/flood level, AQI, MARC delays, outages. | 🟡 Feeds wired (`pulsepoint`, `transitFrederick`, `marcTrains`, `seeclickfix`, `usgsWater`). | Compose one "right now" surface. Gate: each row cites source + freshness; nothing labeled "now" that is stale. |
| **Civic-moat answers by address** — recycling/trash, government hours, "when does X happen." | ⚪ | ⛏ Acquire collection-schedule + GIS. Gate: address-keyed, provenance on every answer. |

### Moat 3 — The network effect (compounds without us)

| Feature | Status | Next move · gate |
|---|---|---|
| **Community supply side** — food trucks posting today's spot, businesses posting tonight's special/happy-hour, residents adding events. Keeps data fresher than Google's; creates ownership. | 🟡 `/submit` + business claim/manage exist; review queue weak; no SMTP. | Strengthen the review queue + claim loop; wire SMTP. Gate: submitted = Unconfirmed tier until vetted; never asserts facts. |
| **Generated, shareable plans** — "A perfect Saturday downtown" from open-now + weather + walking distance, shared as an OG card. | ⚪ (`/plan`, `/weekend`, `/api/og` are the seeds) | Compose a plan generator. Gate: only open/verified places; honest when a slot can't be filled. |
| **Self-guided trails + passport** — history/mural/ghost walks, Beverage Trail passport with a stamp loop. | 🟡 `fcArtTour`, `history.ts`, beverage trail data exist. | Add turn-by-turn + passport state. Gate: route facts sourced; no invented history. |

**Recommended order:** (1) wire the **living radius** to real data — cheapest signature win, infra exists, creates word of mouth; (2) the **Ask as universal fallback** across surfaces (see `/api/ask` + AI Gateway); (3) one **civic-moat answer end-to-end** (recycling-by-address) to prove the provenance pattern; then Moat 3 for the compounding loop.

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
