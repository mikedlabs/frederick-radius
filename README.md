# Frederick Radius

> A smarter way to experience Frederick County.

Frederick Radius is a PWA-first civic discovery platform for Frederick County, Maryland — a single web app that turns 12 fragmented municipalities, 4,500+ businesses, 78 parks, and dozens of civic feeds into one calm, location-aware experience.

**Live:** [frederickradius.app](https://frederickradius.app)
**Strategy:** see `FREDERICK_RADIUS_STRATEGY.md` (kept outside the code repo in the team's working folder).

---

## What ships today

| URL | What it is |
|---|---|
| `/` | The cinematic 10-scene marketing landing (investor + press) |
| `/app/today` | Daily-use dashboard — open now, weather, today, this weekend, walkable, towns |
| `/app/map` | Map view of all places, category-colored pins, Leaflet + CARTO tiles |
| `/app/events` | Event index grouped: live now → today → weekend → later |
| `/app/events/[slug]` | Event detail — full description, ICS download, before/after recommendations, parking nearby |
| `/app/places/[slug]` | Place detail — hours (open-now aware), directions, structured data, nearby + upcoming |
| `/app/m/[municipality]` | One page per town: hero blurb, stats, browse-by-category, upcoming events, top places |
| `/app/category/[slug]` | All places in a category, county-wide |
| `/app/radius` | Set a point + a distance, see what's inside, bucketed by Eat/Do/Practical |
| `/app/saved` | localStorage-backed saved places + events (anonymous-first) |
| `/app/search` | Ranked full-text search across places / events / towns / categories |

Plus: dynamic OG images, Event/LocalBusiness JSON-LD, full sitemap, robots, manifest, install icons.

## Stack

- **Next.js 16** App Router · **React 19** · **TypeScript 5** · **Tailwind 4**
- **Framer Motion** for cinematic scenes
- **Leaflet + react-leaflet** for the map (will swap to Mapbox GL JS in Phase 3)
- **Drizzle ORM** schema committed (Postgres + PostGIS) — DB connection in Phase 1
- **next/og** for runtime OG image generation
- **Vercel** hosting, edge runtime where useful, ISR everywhere else

## Architecture

```
src/
├── app/
│   ├── (marketing)/        # / — cinematic 10-scene demo
│   ├── app/                # /app/* — the PWA
│   │   ├── today/ map/ events/ places/ radius/ saved/ search/
│   │   └── m/[municipality] · category/[slug]
│   ├── api/
│   │   ├── og/             # dynamic OG image generator
│   │   └── events/[slug]/ics  # downloadable .ics calendar files
│   ├── icon.tsx · apple-icon.tsx · manifest.ts · sitemap.ts · robots.ts
│   ├── layout.tsx          # root: fonts, viewport, theme, skip-link
│   └── globals.css         # tokens for marketing + app palettes
├── components/
│   ├── event/ · place/ · today/ · radius/ · saved/ · search/ · nav/ · map/
│   ├── marketing/          # the 10 cinematic scenes
│   └── ui/
├── data/                   # seed data — municipalities, categories, tags, places, events
├── lib/
│   ├── geo.ts              # Haversine, walk/bike/drive minutes ↔ meters, bbox
│   ├── hours.ts            # open-now logic, formatting
│   ├── search.ts           # in-memory ranked search
│   ├── db/schema.ts        # Drizzle schema (Postgres + PostGIS) — committed shape
│   └── loaders/            # places.ts, events.ts — pure server-side data accessors
└── hooks/                  # useSaved (localStorage + useSyncExternalStore)
```

## Local dev

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build; verifies all routes generate
npm run lint
```

No environment variables required for the current scope.

## Roadmap

The 15-deliverable strategy lives in `FREDERICK_RADIUS_STRATEGY.md`. Near-term:

- [ ] Wire Neon Postgres + PostGIS — promote seed data to real DB
- [ ] iCal ingest (DFP, Celebrate Frederick, County) — Vercel Cron
- [ ] Mapbox Studio custom style + swap from Leaflet
- [ ] Business claim flow + dashboard
- [ ] Push notifications (civic emergencies opt-out, saved-event reminders opt-in)
- [ ] AI itinerary builder (grounded in seed data, not hallucinated)

## Closed-business status (P0-2)

Closed places never display. Three layers enforce this:

1. `isOperational` in `src/lib/loaders/places.ts` is the single
   closed-place predicate (manual denylist plus `is_operational`).
   Every surface, including the Radius page, filters through it.
2. `src/data/closures.json` is the audit log of every suppressed
   place. Regenerate with `npm run closures:report`.
3. Google Place Details refresh keeps `is_operational` current for
   curated places that have a `google_place_id`.

Refresh job and cost:

- `npm run refresh:business-status` writes `src/data/business-status.json`.
  It is PAID: one Place Details call per curated place with a place id,
  roughly tens of dollars one-time for the full catalog.
- The nightly cron `/api/cron/business-status` (07:00 UTC) reports
  newly closed places. It is OFF by default and no-ops unless
  `BUSINESS_STATUS_CRON=1`, so deploying it incurs no spend. Each
  enabled run is capped at 40 Place Details calls (well under the
  monthly Google budget target).

## License

Proprietary, copyright MAD Productions. All rights reserved.
