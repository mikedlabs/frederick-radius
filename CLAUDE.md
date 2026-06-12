# Frederick Radius — agent guide

A field-guide app for Frederick County, MD (12 incorporated municipalities
plus Urbana). Next.js App Router on Vercel · Supabase · Mapbox GL ·
Google Places. Production: https://frederickradius.app

## Design system — this is the truth, not older specs

Earlier documents referenced Fraunces and a "Creek blue" palette. The
SHIPPED brand deck (see `src/app/globals.css` tokens) is:

- **Type:** Newsreader (serif display), Public Sans (UI), JetBrains Mono
  (data details: coordinates, counts). `font-serif` = Newsreader.
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

---

> The constitution below was appended June 12, 2026 from the frederickradius-handoff package. Where it conflicts with anything above (notably the nav line under "Locked architecture"), the constitution wins; it encodes newer decisions.

# FrederickRadius: Project Constitution (appended June 12, 2026)

These rules govern every session. They encode decisions already made from a verified live audit. Do not relitigate them; execute against them. Full evidence lives in `frederickradius-handoff/docs/05-site-capture.md`.

## Locked decisions

Confirmed by Mike before Session 1. These are the recommended defaults; if a line is edited, the edit wins.

- **DECISION 1, the root:** `/` becomes the Today surface. The field-guide gallery page retires as a landing surface and its hidden gems content moves to `/collections/hidden-gems`. `/guide` 301s to `/`.
- **DECISION 2, Ask:** The Ask tab is replaced by a Search tab that opens the command sheet (the existing cmdk engine rendered in a mobile sheet). The word Ask leaves the navigation. Tab bar: Today, Events, Map, Search, Saved.
- **DECISION 3, Pulse:** Pulse becomes a conditional alert strip on Today that renders only when at least one category is non-zero, plus an `/alerts` page with empty categories collapsed to one line. `/pulse` 301s to `/alerts`.

## Operating rules (structure)

1. One job per screen. Today answers "what should I do right now." Events answers "what is happening and when." Map answers "where is it relative to me." Saved holds the user's list. A module serving a different screen's job moves there or dies.
2. No event or place renders twice on one screen.
3. Counts are control labels, never content. Any surviving count derives from the exact selector that renders the list it describes.
4. One search system: the command sheet. No page-level text inputs.
5. Empty states collapse to one line or nothing.
6. Weather is one sentence and one link out.
7. Reveal on intent: filters, sort, towns, view modes, and layers live behind a single Refine affordance.
8. Subtraction ships first. No new features, modules, or data sources until the persona suite passes.

## Rules of expensive (design)

- R1. One signature, everywhere. The Radius line owns arrival, pulse, rule, and confirm. Nothing else gets to be clever.
- R2. Motion is physics or nothing: springs, 250 to 400 ms, interruptible, user-caused. No linear fades, no decorative animation.
- R3. Imagery leads editorial surfaces only, and only from Mike's drone library. Lists, results, and civic data stay typographic and fast. No stock photography, ever.
- R4. The interface follows the clock. Daypart token sets (afternoon, golden hour, after dark) driven by the sunset time already fetched with weather. Copy keys off the same clock.
- R5. Texture at two percent: grain and glass are felt, never noticed.
- R6. The signature layer ships only after the subtraction sessions pass their gates.

## Approved dependency kit

`vaul` (sheets and drawers), `cmdk` (command engine, already present), `embla-carousel-react` (snap decks), `@radix-ui/react-*` (tabs, toggle group, dialog primitives), `framer-motion` (layout transitions and springs), `posthog-js` (events and replay). Reach for these before writing custom equivalents. Anything outside this list requires Mike's sign-off in chat first.

## Budgets and gates

Baselines captured June 12, 2026 (see `docs/05-site-capture.md`): /today 310 visible lines and 326 KB decoded HTML; /events 951 lines and 788 KB; root 50 lines; /pulse 122 lines.

Targets: /today under 150 lines and under 150 KB; /events under 400 lines and under 300 KB.

Every session ends with both of these, run against the preview deployment:

```
bash scripts/budget.sh
npx playwright test tests/clutter.spec.ts
```

A session whose gate fails is reverted, not merged. Gate results are appended to `docs/BASELINE.md` with the date so progress is a record, not a feeling.

## Banned vocabulary in code, copy, and commits

No em dashes anywhere. Never the words "craft," "crafting," "soothing," or "staff" (use "team"). Counts never appear in body copy. Complete sentences in all user-facing text.
