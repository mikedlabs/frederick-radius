# Frederick Radius — agent guide

A field-guide app for Frederick County, MD (12 incorporated municipalities
plus Urbana). Next.js App Router on Vercel · Supabase · Mapbox GL ·
Google Places. Production: https://frederickradius.app

## Design system — this is the truth, not older specs

Earlier documents referenced Fraunces and a "Creek blue" palette. The
SHIPPED brand deck (see `src/app/globals.css` tokens) is:

- **Type:** Fraunces (serif display: titles, town/place headers, section
  heads), Inter (UI: nav, labels, buttons, body, dense lists), JetBrains Mono
  (data details: times, distances, counts, coordinates). `font-serif` =
  Fraunces. (Shipped truth per `src/app/layout.tsx`; it replaced the earlier
  Newsreader/Public Sans spec. Inter is a deliberate, if plain, UI face
  paired with the characterful Fraunces display, see `docs/DESIGN_TELLS.md`.)
- **Palette tokens (always use `var(--app-*)`, never raw hex in app UI):**
  paper cream ground `--app-bg #EEE6D4`, ink `--app-ink #16140E`,
  Signal vermilion `--app-brand #E14328`, Spruce green `--app-brand-2`.
  Tints exist (`--app-brand-tint-*`, `--app-ink-tint-*`); radii are
  `--app-radius-sm/md/lg` (9/16/24px). The dark `--background/--foreground`
  tokens are the MARKETING palette (`.marketing-shell`, /pitch) — do not
  delete or "fix" them.
- **Voice:** calm local expert. No em dashes in user-facing copy
  (`cleanFeedText` converts them). Verb-first chip labels ("Eat & drink",
  "Open now"). Counts are supporting detail, never the headline.
- **Aesthetic bar:** a well-made field guide — dense, organized, calm.
  Typography carries hierarchy before boxes/borders/badges. One primary
  action per view. Honest empty states. If a change reads like a generic
  SaaS template, it's wrong.

## Locked architecture (do not restructure)

- Two modes on /map: map-first fast mode + guided discovery; the nav is
  `Ask(/guide) · Today · Map · Events · Saved(/my-radius)` from ONE
  source of truth (`src/components/nav/tabs.ts`).
- Canonicals, sitemap, robots, JSON-LD were audited and fixed (June 2026,
  PRs #504, #516–#520, #530). Don't churn them casually.
- `dynamicParams=false` on places (closed slug set); events/[slug] has NO
  loading.tsx ON PURPOSE (a loading boundary makes Next 16 serve unknown
  slugs a 200 fallback shell — soft 404s).

## Data pipeline — the load-bearing rules

- **Boundary cleaning, never render-time.** Feed text is normalized in
  `src/lib/events/normalize.ts` (titles, descriptions w/ metadata-dump
  strip + sentence dedupe + clamp, venue sanity, slugs) and
  `src/lib/format/placeName.ts`. Surfaces render what loaders hand them.
- **Human corrections** live in `src/data/places-overrides.json`
  (fold/remove/patch). Patches win over automated normalizers by design.
- **One unified event set:** `src/lib/loaders/unifiedEvents.ts` is THE
  assembly (curated + iCal + Ticketmaster + Bandsintown + venue lineups,
  deduped, classified, time-sanity-guarded). /today and /events both call
  it; never count events from a different query.
- **After changing place data or its cleaning:** regenerate the client
  dataset — `npm run build:client-places` (search/map/funnel read
  `places-client.json`, not the loaders). Lesson of PR #503.
- **After changing how CACHED data is cleaned/shaped:** bump the
  `unstable_cache` key (e.g. `ingested-series-vN`) — the cache persists
  across deploys. Lesson of PR #509.

## Verification norms

- `npx tsc --noEmit` · `npx eslint <changed files>` · `npx vitest run`
  must pass before any commit.
- CI `verify` / `style-lint` are pre-existing infra reds (account-level
  Actions limits) — local runs are the gate.
- After a merge, prod deploys automatically (~3–4 min). Verify the change
  ON PROD (`scripts/prod-audit.mjs` with `EXPECTED_SHA`, plus a check
  specific to the change). Stale ISR entries persist briefly
  (stale-while-revalidate) — test never-seen URLs for fresh behavior.
- Tap targets: ≥44px effective. Small controls use the invisible
  extender — `.tap-44` (globals.css) or a `before:` overlay (Pill).

## Branch & PR conventions

Work on `claude/<topic>` branches off CURRENT `origin/main` (fetch first
— deploy-wait scripts often leave the checkout on a stale branch). One
concern per PR. Commit messages explain the WHY and cite the audit/issue
they close.
