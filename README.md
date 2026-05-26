# Frederick Radius

> The pocket compass for Frederick County, Maryland. What's open, what's happening, where, and how to get there.

**Live:** [frederickradius.app](https://frederickradius.app)
**Companion docs:** [`AUDIT.md`](./AUDIT.md) (what works, what's half-working) · [`ROADMAP.md`](./ROADMAP.md) (what's shipping, scaffolded, or unbuilt) · `docs/archive/` (historical decisions, pre-overhaul state).

---

## What ships today

Four primary tabs:

| Tab | URL | What it does |
|---|---|---|
| **Now** | `/now` | Daily briefing — weather (hourly + 7-day) · 3 right-now picks (open · starting soon · weekend bet) · mood tiles · events scoped to the active lens |
| **Browse** | `/browse` | Map of all places with category-color clustered pins, layers drawer for civic / transit / trails / amenities |
| **Plan** | `/events` | Lens-driven event explorer (Tonight · Tomorrow · Weekend · This week · Free) with month-view calendar |
| **Saved** | `/saved` | localStorage-backed bookmarks · recently-viewed places · smart town-cluster suggestions |

### Deep-link routes (not in bottom nav but discoverable)

- `/places/[slug]` · `/category/[slug]` · `/m/[slug]` · `/events/[slug]` · `/events/calendar`
- `/radius` (Within-reach mode for the map) · `/search` (one ranked list) · `/pulse` (deep weather)
- `/parks` · `/trails` · `/trail` (beverage trail) · `/transit` · `/water` · `/history` · `/from-above`

### Meta + flow

- `/` redirects: new visitor → `/about` · returning (cookie set) → `/now`
- `/welcome` — 2-step mood + live-here onboarding
- `/about` — 30-second pitch · `/trust` — data source commitments
- `/business/claim` · `/business/manage/[token]` · `/submit/place` · `/submit/event`
- `/admin/*` — Basic Auth gated dashboards (claims, data-health, dedup-review, etc.)

Plus: dynamic per-place OG images via `/api/og`, Event + LocalBusiness JSON-LD, full sitemap, robots.txt, manifest with PWA install icons, push-notification scaffolding.

## Stack

- **Next.js 16** App Router · **React 19** · **TypeScript 5** · **Tailwind 4**
- **Mapbox GL JS** + custom paper-mode palette (was Leaflet — switched May 2026)
- **Vaul** for bottom drawers · **cmdk** for the ⌘K command palette · **nuqs** for URL state
- **Sonner** for toasts · **Framer Motion** for shelf reveals
- **Drizzle ORM** schema committed (Postgres + PostGIS) — DB usage limited to feed-snapshots
- **next/og** for runtime OG image generation
- **Sentry** for runtime error capture (when `SENTRY_DSN` is set)
- **Vercel** hosting · ISR everywhere · Skew Protection enabled

## Architecture

```
src/
├── app/
│   ├── (marketing)/         # / — cinematic 10-scene demo (investor + press)
│   ├── (app)/               # the PWA route group
│   │   ├── now/             # the home briefing
│   │   ├── browse/          # the map (the merged map + radius surface)
│   │   ├── events/          # plan tab + [slug] + calendar
│   │   ├── places/          # directory + [slug]
│   │   ├── m/[municipality] # town pages
│   │   ├── category/[slug]  # category surfaces
│   │   ├── saved/ · search/ · about/ · welcome/ · trust/ · settings/
│   │   ├── radius/ · pulse/ · history/ · parks/ · trails/ · trail/
│   │   ├── transit/ · water/
│   │   └── layout.tsx       # bottom-nav layout chrome
│   ├── admin/               # gated admin dashboards
│   ├── business/            # claim + manage
│   ├── submit/              # add a place / event
│   ├── from-above/          # the photo book microsite
│   ├── api/
│   │   ├── og/              # dynamic OG image generator
│   │   ├── isochrone/       # Mapbox isochrone proxy
│   │   ├── events/[slug]/ics
│   │   └── push/, /discover/, /cron/
│   ├── icon.tsx · apple-icon.tsx · manifest.ts · sitemap.ts · robots.ts
│   ├── layout.tsx           # root: fonts, Toaster, NuqsAdapter, SW register
│   ├── middleware.ts        # /welcome gate + /admin Basic Auth
│   └── globals.css          # design tokens + .reveal-up + .shimmer + .cmdk-* + .wx-* + .sky-*
├── components/
│   ├── now/ · today/        # /now sections + WeatherHero stack
│   ├── event/ · place/ · saved/ · search/ · radius/ · map/
│   ├── nav/                 # BottomNav (4 tabs, sliding indicator) · TopBar · RouteAccent
│   ├── cmdk/                # ⌘K command palette
│   ├── ui/                  # primitives (BottomDrawer, Skeleton, ReasonChip, etc.)
│   └── marketing/           # the 10 cinematic scenes
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

Three jobs the app does. Every route is structure under one of them:

1. **NOW** — answer "what should I do right now / soon" (weather, open, near, happening)
2. **BROWSE** — answer "what's here / where / what kind" (map, directory, town, category, radius)
3. **PLAN** — answer "what's coming up" (events list, calendar, weekend)

Saved is your stuff — not a job, a holding area.

Old `/today`, `/map`, `/discover`, `/tonight`, `/markets`, `/historic`, `/art`, `/amenities` all 301 to canonical destinations via `next.config.ts`.

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
