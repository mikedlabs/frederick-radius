# Frederick Radius

> Frederick County starts where you are.

Frederick Radius brings Frederick County's scattered local information into one
guide and sorts it by your location.

**Live:** [frederickradius.app](https://frederickradius.app)
**Brand system:** [`docs/brand/BRAND_GUIDE.md`](./docs/brand/BRAND_GUIDE.md)
**Companion docs:** [`STATE.md`](./STATE.md) (the single source of truth for current state + the sequenced plan) · [`docs/NORTH_STAR.md`](./docs/NORTH_STAR.md) (what the product is + the laws) · [`docs/USER_FIRST_INTERACTION_CONTRACT.md`](./docs/USER_FIRST_INTERACTION_CONTRACT.md) (the interaction rules). Historical (superseded by `STATE.md`, kept for reasoning): [`UX_REDO.md`](./UX_REDO.md) (still holds the data-confidence gate) · [`AUDIT.md`](./AUDIT.md) · [`ROADMAP.md`](./ROADMAP.md) · `docs/archive/`.

---

## What ships today

Four primary tabs (the bottom nav; single source of truth in `src/components/nav/tabs.ts`):

| Tab | URL | What it does |
|---|---|---|
| **Today** | `/today` | The home. Today still leads with weather + an events shelf; the answer-first reframe (the "intelligence layer" home) is UX_REDO Layer 2. Mounts a time-aware masthead with SkyHero/TodayCard weather, civic alerts, the moment spotlight and Fair feature, the on-now band, daypart needs, the Today's Ask launcher, and the weekend/tomorrow previews (see `src/app/(app)/today/page.tsx`). Hourly and 7-day forecasts live at `/pulse?open=weather`, which Today links to. |
| **Map** | `/map` | Pinpoint-first map with category-color pins + a layers drawer (civic / transit / trails / amenities). Radius is a mode here: `/map?mode=radius`. |
| **Events** | `/events` | Lens-driven event explorer (Tonight · Tomorrow · Weekend · This week · Free) with month-view calendar. |
| **Saved** | `/my-radius` | Local and synced saves, recently viewed places, and follows. |

### Deep-link routes (not in bottom nav but discoverable)

- `/places/[slug]` · `/category/[slug]` · `/m/[slug]` · `/events/[slug]` · `/events/calendar`
- `/map?mode=radius` (within-reach mode) · `/search` (one ranked list) · `/pulse` (live conditions)
- `/parks` · `/trails` · `/trail` (beverage trail) · `/transit` · `/rivers` · `/history` · `/from-above`

### Meta + flow

- `/` redirects to `/today`. The onboarding/about gate was removed pre-launch; the persona affordance is now an in-page chip, not a forced redirect.
- `/welcome` — 2-step mood + live-here onboarding (reachable, no longer gated)
- `/about` — 30-second pitch · `/trust` — data source commitments
- `/business/claim` · `/business/manage/[token]` · `/submit/place` · `/submit/event`
- `/admin/*` — Basic Auth gated dashboards (claims, data-health, dedup-review, etc.)

Plus: dynamic per-place OG images via `/api/og`, Event + LocalBusiness JSON-LD, full sitemap, robots.txt, manifest with PWA install icons, push-notification scaffolding.

## Stack

- **Next.js 16** App Router · **React 19** · **TypeScript 5** · **Tailwind 4**
- **Mapbox GL JS** + custom paper-mode palette (was Leaflet — switched May 2026)
- **Vaul** for bottom drawers · **nuqs** for URL state
- **Sonner** for toasts · **Framer Motion** for shelf reveals
- **Supabase** (auth + Postgres) · **Drizzle ORM** schema committed (Postgres + PostGIS) — DB usage limited to feed-snapshots + auth/follows
- **next/og** for runtime OG image generation
- **Sentry** for runtime error capture (when `SENTRY_DSN` is set)
- **Vercel** hosting · ISR everywhere · Skew Protection enabled

## Architecture

```
src/
├── proxy.ts                 # /admin Basic Auth + Supabase session refresh
├── app/
│   ├── pitch/               # cinematic marketing demo (investor + press)
│   ├── (app)/               # the PWA route group
│   │   ├── page.tsx         # "/" → redirects to /today
│   │   ├── today/           # the home (answer-first reframe is UX_REDO L2)
│   │   ├── map/             # the map + radius mode (?mode=radius)
│   │   ├── events/          # events tab + [slug] + calendar
│   │   ├── places/          # directory + [slug]
│   │   ├── m/[municipality] # town pages
│   │   ├── category/[slug]  # category surfaces
│   │   ├── my-radius/ · search/ · about/ · welcome/ · trust/ · settings/
│   │   ├── pulse/ · history/ · parks/ · trails/ · trail/ · rivers/
│   │   ├── transit/ · find/ · weekend/ · plan/ · collections/ · amenities/
│   │   └── layout.tsx       # bottom-nav layout chrome
│   ├── admin/               # gated admin dashboards
│   ├── business/            # claim + manage
│   ├── submit/              # add a place / event
│   ├── from-above/          # the photo book microsite
│   ├── api/
│   │   ├── og/              # dynamic OG image generator
│   │   ├── isochrone/       # Mapbox isochrone proxy
│   │   ├── events/[slug]/ics
│   │   └── push/, /discover/, /cron/, /ingest/
│   ├── icon.tsx · apple-icon.tsx · manifest.ts · sitemap.ts · robots.ts
│   └── layout.tsx           # root: fonts, Toaster, NuqsAdapter, SW register
├── components/
│   ├── now/ · today/        # /today sections + weather/answer stack
│   ├── event/ · place/ · saved/ · search/ · radius/ · map/
│   ├── nav/                 # BottomNav (4 tabs, sliding indicator) · TopBar · RouteAccent
│   ├── ui/                  # primitives (BottomDrawer, Skeleton, ReasonChip, etc.)
│   └── marketing/           # the cinematic scenes (rendered at /pitch)
├── data/                    # municipalities, categories, places, events + enrichment JSON
├── lib/
│   ├── loaders/             # places, events, calendar — pure server data accessors
│   ├── integrations/        # NWS · ical-live · ticketmaster · bandsintown · hood · feed-snapshot
│   ├── db/schema.ts         # Drizzle schema (feed_snapshots, places, etc.)
│   ├── geo.ts · hours.ts · search.ts · personalize.ts · view-state.ts
│   └── tz.ts                # America/New_York-aware time math
└── hooks/                   # useSaved, useRecentPlaces, useRecentSearches, useMode
```

## Information architecture

Three jobs the app does. Every route sits under one of them:

1. **TODAY** — answer "what should I do right now / soon" (weather, open, near, happening). The home; see [`docs/NORTH_STAR.md`](./docs/NORTH_STAR.md) for the answer-first reframe.
2. **MAP** — answer "what's here / where / what kind" (map, directory, town, category, radius mode)
3. **EVENTS** — answer "what's coming up" (events list, calendar, weekend)

Saved keeps the places, events, and beer picks a user wants to return to.

Renamed routes 301 to their canonical destinations via `next.config.ts`: `/now` → `/today`, `/browse` → `/map`, `/saved` → `/my-radius`, `/radius` → `/map?mode=radius`, `/water` → `/rivers`, plus the older `/discover`, `/tonight`, `/markets`, `/historic`, `/art`, `/amenities`.

## Local dev

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build; verifies all routes generate
npm run lint
npm test         # vitest unit tests
npm run test:e2e # Playwright E2E
```

### Optional environment variables

Activate live features by setting these on Vercel (or `.env.local`):

| Env var | What it activates |
|---|---|
| `HOOD_CALENDAR_URL` | Hood College iCal endpoint override (default points at Trumba) |
| `WEINBERG_CALENDAR_URL` | Weinberg live feed — inert by default (see AUDIT) |
| `DELAPLAINE_CALENDAR_URL` | Delaplaine live feed — inert by default |
| `TICKETMASTER_API_KEY` | Real ticketed shows via Discovery API |
| `BANDSINTOWN_APP_ID` | Live music shows (also needs a curated artist list) |
| `GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL` + `GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED=1` | Code-level hold for Google maintenance, Routes, and event-address geocoding. The approval value must be exactly `written-google-authorization-confirmed` and should be recorded only after reviewed written authorization covers Radius's actual use; credentials alone never activate those paths. |
| `GOOGLE_PLACES_API_KEY` | Dedicated Places credential. It preserves the existing attributed, key-safe photo proxy; enrichment and hours remain off unless the platform approval and runtime switch above are also valid. |
| `GOOGLE_PHOTO_DAILY_CAP` | Eastern-day spike ceiling for the existing no-store place-photo proxy. The 1,500 default preserves normal visual coverage while bounding bots, retries, and accidental eager loads; code will not accept more than 2,000. |
| `GOOGLE_ROUTES_API_KEY` + `GOOGLE_ROUTES_ENABLED=1` | Dedicated Routes credential and feature switch. There is no Places-key fallback and route results are not persisted. |
| `GOOGLE_GEOCODING_API_KEY` + `GOOGLE_GEOCODING_ENABLED=1` | Optional Google event-address fallback. It also requires the platform approval/runtime settings; the Places key is never used, and official County address data is tried first. |
| `SENTRY_DSN` | Runtime error capture |
| `NEXT_PUBLIC_PLAUSIBLE_SRC` | Optional override for the checked-in Frederick Radius `pa-….js` URL, mainly for a future first-party proxy |
| `DATABASE_URL` | Server-side Postgres for saved data, submissions, hours, telemetry, and hybrid search |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Gate `/admin/*` (fail-closed by default) |
| `BUSINESS_STATUS_CRON=1` | Manual legacy status diagnostic. It is not scheduled because `hours-refresh` already collects the same status in its paid request. |
| `HOURS_REFRESH_CRON=1` | Daily bounded Google-backed hours refresh. Paid and still blocked unless the Google policy/runtime gate is valid. |
| `RADIUS_SEARCH_CRON=1` | Daily bounded refresh of the private Ask Radius search index |
| `RADIUS_SEARCH_SEMANTIC_ENABLED=1` + `RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT` | Optional scheduled direct-OpenAI vectors behind an atomic Eastern-day document cap. A key alone never enables them; Postgres FTS remains required. |
| `ASK_AI_RUNTIME_ENABLED=1` + `ASK_AI_DAILY_CALL_LIMIT` | Public Ask model turns, each reserved atomically under a code-bounded Eastern-day cap. Deterministic/local answers remain available when off. |
| `ASK_AI_PROVIDER` | Chooses exactly one Ask text provider (`gateway`, `anthropic`, or `openai`); provider failures never waterfall into a second bill. |
| `ASK_RADIUS_AGENT=1` | Explicitly opts complex Gateway requests into the multi-step tool agent. Each step reserves from the same daily model-call cap; default is off. |
| `ASK_AI_RUNTIME_EMBEDDINGS_ENABLED=1` + `ASK_AI_EMBEDDING_DAILY_LIMIT` | Optional visitor-time semantic recall. Postgres FTS remains the default and fallback. |

The Starter-plan goal list and installation check are in [docs/PLAUSIBLE_STARTER.md](docs/PLAUSIBLE_STARTER.md).
The complete value-free setup template is [`.env.example`](./.env.example).

Mapbox uses separate browser and server paths. `NEXT_PUBLIC_MAPBOX_TOKEN`
controls map rendering and `MAPBOX_SERVER_TOKEN` handles Static Images,
Directions, and Isochrone without entering the client bundle. The validated
publishable browser token must be supplied at build time and URL-restricted to
Radius; source control contains no live fallback. Event-address geocoding is a fail-closed enrichment:
it runs only when `MAPBOX_GEOCODING_ENABLED=1`, and every upstream call is
recorded in the admin cost view. `MAPBOX_MATRIX_ENABLED=1` is the global Matrix
breaker for Ask, map search, and the Within reach route; a
`MAPBOX_MATRIX_DAILY_ELEMENT_CAP=0` setting keeps every Matrix path off without
removing the server token. Disabled Matrix enrichment always leaves the local
distance ranking in place, and Matrix responses are not persisted.

## Closed-business handling

Closed places never surface. Three guards:

1. `isOperational` in `src/lib/loaders/places.ts` is the canonical predicate.
2. `src/data/closures.json` is the audit log of suppressed places. Regenerate with `npm run closures:report`.
3. The nightly `/api/cron/hours-refresh` job refreshes hours and business status
   in the same cost-capped Google Place Details call, then Data Steward pulls
   the reviewed snapshot from Supabase. The older status-only route remains a
   manual diagnostic and is not scheduled because it would buy the same fact
   twice.

## License

Proprietary — © Michael DeMattia. All rights reserved.

Made in Frederick, MD by Michael DeMattia, a downtown Frederick resident.
