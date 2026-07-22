# Frederick Radius

> Frederick County starts where you are.

Frederick Radius helps people find open places, local events, and practical
information across Frederick County, Maryland.

**Live:** [frederickradius.app](https://frederickradius.app)
**Brand system:** [`docs/brand/BRAND_GUIDE.md`](./docs/brand/BRAND_GUIDE.md)
**Companion docs:** [`docs/NORTH_STAR.md`](./docs/NORTH_STAR.md) (what the product is + the laws) · [`UX_REDO.md`](./UX_REDO.md) (the sequenced redo plan + data-confidence gate) · [`AUDIT.md`](./AUDIT.md) (what works, what's half-working) · [`ROADMAP.md`](./ROADMAP.md) (what's shipping, scaffolded, or unbuilt) · `docs/archive/` (historical decisions, pre-overhaul state).

---

## What ships today

Four primary tabs (the bottom nav; single source of truth in `src/components/nav/tabs.ts`):

| Tab | URL | What it does |
|---|---|---|
| **Today** | `/today` | The home. Today still leads with weather + an events shelf; the answer-first reframe (the "intelligence layer" home) is UX_REDO Layer 2. Renders weather (hourly + 7-day), TodayMoves + MoveStack, TwoDoors, mode-scoped events, MoodTiles. |
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
- **Vaul** for bottom drawers · **cmdk** for the ⌘K command palette · **nuqs** for URL state
- **Sonner** for toasts · **Framer Motion** for shelf reveals
- **Supabase** (auth + Postgres) · **Drizzle ORM** schema committed (Postgres + PostGIS) — DB usage limited to feed-snapshots + auth/follows
- **next/og** for runtime OG image generation
- **Sentry** for runtime error capture (when `SENTRY_DSN` is set)
- **Vercel** hosting · ISR everywhere · Skew Protection enabled

## Architecture

```
src/
├── middleware.ts            # /admin Basic Auth + Supabase session refresh
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
│   ├── cmdk/                # ⌘K command palette
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
| `GOOGLE_MAPS_API_KEY` | Places enrichment + isochrone (one-time job, already loaded) |
| `MAPBOX_ACCESS_TOKEN` | Map tiles + isochrone proxy |
| `NWS_USER_AGENT` | Required identifier for the NWS API |
| `SENTRY_DSN` | Runtime error capture |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Plausible analytics |
| `DATABASE_URL` | Postgres for feed-snapshot telemetry |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Gate `/admin/*` (fail-closed by default) |
| `BUSINESS_STATUS_CRON=1` | Nightly Google Place Details refresh (PAID — off by default) |

## Closed-business handling

Closed places never surface. Three guards:

1. `isOperational` in `src/lib/loaders/places.ts` is the canonical predicate.
2. `src/data/closures.json` is the audit log of suppressed places. Regenerate with `npm run closures:report`.
3. The nightly `/api/cron/business-status` job (gated `BUSINESS_STATUS_CRON=1`) refreshes from Google Place Details, capped at 40 calls per run.

## License

Proprietary — © Michael DeMattia. All rights reserved.

Made in Frederick, MD by Michael DeMattia, a downtown Frederick resident.
