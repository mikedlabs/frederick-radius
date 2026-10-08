# Frederick Radius agent guide

A current local information app for Frederick County, MD (12 incorporated
municipalities plus Urbana). Next.js App Router on Vercel · Supabase · Google
Places · Mapbox GL for /map, radius mode and /transit · self-hosted MapLibre
on county PMTiles for mini maps, the /towns and /parks overview, the events
map and field tools (`docs/MAPLIBRE_SURFACES.md`). Production:
https://frederickradius.app

This is Next 16, whose APIs differ from your training data. Check
`node_modules/next/dist/docs/` before using a Next API from memory.

## Which doc wins

1. This file.
2. `docs/VISUAL_FIRST.md` for imagery, missing-photo fallbacks and first screens.
3. `docs/brand/BRAND_GUIDE.md` (identity),
   `docs/USER_FIRST_INTERACTION_CONTRACT.md` (interaction), `docs/VOICE.md` (copy).
4. `docs/STYLE.md`, `docs/DESIGN_TELLS.md` and `docs/PHOTO_POLICY.md`, which
   are implementation references and defer to the above.

Files with a date in their name, root-level plans and audits, and anything
under `docs/archive`, `docs/audits` or `docs/reviews` are history, not
instructions. When docs conflict, fix the older one in the same PR; if it is
marked owner-approved, flag a one-line owner confirmation instead of stopping
work.

## Design system

`src/lib/brand.ts` is the code source of truth, mirrored by the `--app-*`
tokens in `src/app/globals.css`. No script writes
`docs/brand/Frederick-Radius-Brand-Guide.html`; keep its palette, names and
version line matching `brand.ts` by hand, or `npm run build:brand` fails.

- **Visual first (owner direction, 2026-10-07):** people read pictures before
  sentences, so every surface shows before it tells. Each answer row, card
  and first screen leads with a real visual: a photo that actually loaded, a
  publisher flyer shown whole, the place's block on the self-hosted MapLibre
  map, a time strip, a date plate, or a category mark on the place's own
  color. Prose is kept for what a picture cannot say. Visuals must be honest:
  no text plate or generated art presented as a photo, no credit before a
  photo loads, no type over third-party flyers. A missing photo falls down
  the image ladder, never to a lettered plate. A category mark or date plate
  can lead a row, but a first screen meets the floor only with a real picture
  or map of 96 px or more (`npm run check:visual-floor`). A text-only state
  is a fallback, not a design. Ladder, prose budget, supply and build order:
  `docs/VISUAL_FIRST.md`.
- **Type:** Libre Caslon Display Regular carries the wordmark and rare
  editorial or campaign moments. Public Sans carries product page titles,
  section titles, body copy, navigation, controls, labels, times, distances,
  and tabular numerals. Public Sans may use its real variable italic. There is
  no third technical typeface and no faux bold or italic Caslon face. Legacy
  `.font-serif` maps to Public Sans. Use `.font-brand` for the wordmark and
  `.font-editorial` only for a deliberate editorial hero. Map labels are the
  one exception: Mapbox maps use `MAPBOX_LABEL_FONT_*` and MapLibre maps the
  vendored Noto Sans `MAP_LABEL_FONT_*`; any other MapLibre `text-font`
  silently renders a wrong local font.
- **Palette tokens (always use `var(--app-*)`, never raw hex in app UI):**
  Cream `--app-bg #F4EEE2`, Ink `--app-ink #221C15`, Brick
  `--app-brand #B5462B`, and Catoctin Forest `--app-brand-2 #315A43`.
  Catoctin Forest is for terrain, parks, trails, and small positive/open
  signals, not generic selected states, headers, or page washes. Creek
  `--app-cool #285D73` is reserved for civic, map, transit, and data use. Plum
  `--app-accent #7E2C6F` is a limited arts/editorial accent. Ochre Amber
  `--app-amber #C58A32` communicates a real live, caution, or sunlight state
  with Ink on top. Beer is the deliberate product exception: Amber marks an
  active taste control, flagship beer, or beer/brewery metadata without
  turning the page into an Amber theme. Tints and radii use the existing
  named token scales.
- **Mark:** use `RippleMark` or a `public/brand` asset: three arcs from 48 px,
  two arcs at 24–47 px, the one-arc favicon below. Do not redraw it, wrap it
  in the retired circle, or invent a page-specific logo.
- **Surface:** Cream is the normal product canvas. Ink is a rare contrast
  moment, not a default page theme. Every product surface, Beer and Live
  conditions included, keeps the same identity rather than inventing a
  palette. Bring the internal `/pitch` deck into the brand system before it
  goes public.
- **Voice:** calm local expert. No em dashes in user-facing copy
  (`cleanFeedText` converts them). Verb-first chip labels ("Eat & drink",
  "Open now"). Counts are supporting detail, never the headline. No
  metaphors; say the true thing plainly. Full rules, banned words and worked
  copy: `docs/VOICE.md`. Canonical tagline: "Frederick County starts where
  you are."
- **Sentence discipline:** user-facing prose uses complete sentences, never a
  casual voice built from clipped stacks such as "Good beer. Good people.
  Right now." Headings, buttons and data labels may be short phrases.
- **No automatic rhetorical groups of three:** do not default to three
  clauses, benefits, adjectives or matching sentences for rhythm. Three
  results, steps or cards are correct when the data calls for three.
- **Aesthetic bar:** a distinctive local information tool that is organized,
  calm, and immediately useful. Typography carries hierarchy before
  boxes/borders/badges. One primary action per view. Honest empty states. If a
  change reads like a generic SaaS template, it's wrong.

## Owner's public voice (Reddit, social, email — anything Mike posts)

When drafting replies or posts the owner will publish under his own name
(owner rule, 2026-07-15: "that's how I need to talk all the time"), the
draft must read like a person typing in a thread, not composed copy:

- **No em dashes, ever.** Periods, commas, or parentheses. (Same rule as
  app copy, and the #1 "AI wrote this" tell.)
- **No bullet lists in forum/social replies.** Flowing prose with uneven
  sentence lengths. A rough inline list is fine; parallel-polished
  structure is not.
- **Banned tics:** "genuinely", "truly", "I appreciate", "delve",
  snappy symmetric phrasing ("crowned the answer"), tidy
  concede→enumerate→invite arcs, and any closing line that sells.
- **Specifics are the voice.** "South of downtown" and "dog waste stations"
  beat any adjective. One technical
  detail max, picked for the audience ("a test that fails the build"
  for a software person).
- **Concede fast, prove with shipped facts.** "You were right, it's
  fixed, it's live" and only claim what is actually deployed; anything
  pending is "still on my list."
- **Natural, complete sentences:** contractions and digits ("5 minutes") are
  fine, and an occasional plain admission ("my screwup") can help. Do not
  imitate a human voice with sentence fragments. When unsure, end plainly.
- **Never argue about AI or tools.** The app being right is the entire
  argument; that debate gets zero oxygen.

## Owner decisions in force

Each is recorded at the source named, as are the locks below. Other dated
owner calls sit beside the code they govern; search for "owner call" before
changing a surface.

- 2026-07-08, "the map IS the page": /map has no Nearby/Whole-county pill and
  no desktop "In view" panel (`src/app/(app)/map/page.tsx`,
  `src/components/map/AppMapClient.tsx`).
- 2026-07-21: the city scope is "Frederick City" (`src/data/municipalities.ts`).
- July 2026: a place page's one save control is a labeled "Save"/"Saved"
  button under the title, worded to match the Saved tab
  (`src/components/place/MyRadiusButton.tsx`).
- Public business claiming stays off until the owner asks
  (`src/app/business/claim/page.tsx`).

**Pending owner calls: fix bugs freely, do not redesign without asking.**

- Caslon on the Ask title (`AskFrederick.tsx`), against the type rule above.
- The desktop SideRail and the top bar's Beta label.
- NPS park-closure severity on Today (`countyStatus.ts` calls it an owner
  decision, but none is recorded).
- The #1734 selected-tab style and Today's "Plan a few hours" tile.
- The Mapbox wordmark, left as Mapbox ships it.
- Flyer or venue-photo thumbnails on compact event rows. Venue map tiles for
  precise geocodes may proceed.
- The floating Find me / Near me pill on /map (`MapEdgeTools.tsx`), against
  the scope lock below.
- Today's 160px photo band and 380px masthead-to-Find budget. Keep
  `TodayHierarchy.spec.ts` and `e2e/today-visual-layout.spec.ts` green.
- Whether public claiming returns so owners can add photos (VISUAL_FIRST
  build step 6 assumes it).

## Locked architecture (do not restructure)

Preserve the single request doorway, explicit location scope, one-overlay
limit and origin-aware Back in `docs/USER_FIRST_INTERACTION_CONTRACT.md` when
adding or changing tools.

- /map is the clean whole-county browse surface. A first-time visitor may see
  one consent sheet (**Use my location** or **Browse county**) that explains
  the benefit before any browser prompt. After that, the shared header
  location control is the sole Near me / Whole county / town scope control
  (`src/components/map/mapUserFirstContracts.spec.ts`). Do not add another
  floating Locate or scope toggle to the map; the existing Find me pill is a
  pending owner call.
- Radius mode lives at `/map?mode=radius`, reached from the dock's "Compare
  travel reach", the 15-minute map scene and Find actions. Don't add a
  floating Nearby toggle for it without an owner ask.
- The nav is FOUR tabs, `Today · Map · Events · Saved(/my-radius)`, from ONE
  source of truth (`src/components/nav/tabs.ts`, `tabs.spec.ts`). Ask is
  deliberately NOT a fifth tab: it lives at `/ask` as a focused workspace,
  reached from Today's compact launcher and from Compass. The old `/guide` URL
  redirects to `/ask` (`tests/ask-redirect.spec.ts`), so don't link `/guide`.
- Canonicals, sitemap, robots and JSON-LD were audited in June 2026. Don't
  churn them casually.
- Places keep `dynamicParams=false` (closed slug set; no test guards it).
  events/[slug] has NO loading.tsx ON PURPOSE: a loading boundary makes Next 16
  serve unknown slugs a 200 fallback shell, a soft 404
  (`tests/event-detail-timeout-boundary.spec.ts`).

## Data pipeline: the load-bearing rules

- **Boundary cleaning, never render-time.** Normalize text where it enters:
  `src/lib/events/normalize.ts`, `src/lib/format/placeName.ts`, and source
  adapters such as `ical-live.ts`, `roadIntelligenceModel.ts` and
  `loaders/fieldNotes.ts`. Surfaces render what loaders hand them.
- **Human corrections** live in `src/data/places-overrides.json` (`fold`,
  `remove`, `keepApart`, `patch`). Patches win over automated normalizers by
  design.
- **One unified event set:** `src/lib/loaders/unifiedEvents.ts` is THE
  assembly (curated + iCal + Ticketmaster + Bandsintown + venue lineups,
  deduped, classified, time-sanity-guarded). The event-archive cron writes it
  to a durable archive that /today, /events, /m, /search and the map layers
  read through `src/lib/loaders/todayEventSnapshot.ts`
  (`todayEventSnapshot.spec.ts` and `mapColdOpenContract.spec.ts` forbid
  request-time assembly there); Ask, OG images and calendar export call
  `assembleUnifiedEvents` directly. Never count events from a different query
  (/towns' `town-event-counts.ts` is a known divergence). Application builds
  read only promoted curated + venue snapshots.
- **After changing place data or its cleaning:** regenerate the client
  dataset with `npm run build:client-places` (search/map/funnel read
  `places-client.json`, not the loaders), run its gates, then update the
  reviewed release stream with `npm run data:release:write -- --stream places`.
  Application builds validate committed artifacts and never regenerate them.
  Lesson of PR #503.
- **After changing how CACHED data is cleaned or shaped:** an
  `unstable_cache` key that includes `VERCEL_GIT_COMMIT_SHA` resets each
  deploy. A key without it (such as `ask-answer-vN`) persists across deploys,
  so bump its version. Lesson of PR #509.
- **The Postgres `places` and `events` tables are NOT the catalog.** Places
  come from `src/data/places-client.json` (client) or
  `src/lib/loaders/places.ts` (server). Never read `public.places` for
  content, overrides or counts: it is a checksum-gated PostGIS mirror that
  `postgisNearbyPlaceDistances()` reads only for distances, falling back to
  the client catalog when stale. Keep those spatial reads. `schema.events` is
  vestigial; live events flow from `ingested_events` through the assembly.
- **Ask's local search index must never be empty.** Full-text search over
  `radius_search_documents` is the required baseline, and
  `hybridPlaceSearch()` fails soft to `[]`, so keep `RADIUS_SEARCH_CRON=1` in
  Vercel Production and watch the `semantic-index` tripwire. Enrich documents
  before buying vectors (`docs/ASK_SEARCH_INDEX.md`).

## Verification norms

`.claude/commands/ship.md`, `.claude/commands/verify.md` and
`.claude/agents/verify-app.md` mirror this section; change them together.

### Every commit

- `npm run typecheck`, `npx eslint <changed files>` and `npx vitest run` must
  pass. After copy, data or helper changes, also run `npm run test:node` and
  `npm run test:helpers`, whose `node --test` files vitest never runs.
- **Lockfile edits: regenerate with `npx -y npm@10 install`, never bare
  `npm install`.** CI pins node 22, whose npm 10 rejects locks written by
  npm 11+ ("Missing: <pkg> from lock file" in `npm ci`). Such a lock breaks
  every CI job, main's included, and reads like a branch conflict when it is
  a version skew (2026-08-20).

### UI changes

- `npm run style:lint && npm run lint:colors && npm run lint:zindex &&
  npm run lint:type-scale && npm run lint:place-photo`: the required
  style-lint job. Paint place and venue photos with
  `src/components/ui/RadiusPhoto.tsx`.
- `npm run test:ux` (axe WCAG A/AA, zero violations) runs in CI only when
  `ux-audit.yml` is dispatched, so run it locally for UI changes. If no
  browser can run, say so in the PR and dispatch `ux-audit.yml` before merging
  a large visual change. Pending owner call: should it run on every PR?
- Review Find, Ask and map changes with `npm run test:visual:capture`; only
  reviewed Linux/Chromium references become baselines. Sandbox and worktree
  browser setup: `docs/VISUAL_CONTRACT.md`.
- Tap targets: ≥44px effective. Use `.tap-44` for an isolated control and
  `.tap-44-y` in a horizontal row (chips, pills). Both use `::after`; never
  hand-roll a `before:` overlay.

### Component workshop

- Reuse the shared primitives in Storybook before inventing a new card,
  button, chip, heading, empty state, or drawer. Run `npm run storybook`
  (also served to agents by the `storybook` MCP server in `.mcp.json`) and
  inspect the real mobile states at 320, 375, 390, and 430 pixels.
- A shared UI primitive is any component two or more surfaces use, wherever
  it lives. Changing one updates or adds its story and passes
  `npm run test:storybook`, whose accessibility checks fail the test.
  Parallel agents write the story (static when WebGL or network is needed)
  and leave the run to integration.

### CI and after merge

- CI `verify` (which also runs the build, `test:storybook` and
  `test:release`) and `style-lint` are REQUIRED on main's ruleset. A red one
  is real until shown otherwise and blocks the merge, nightly data PRs
  included.
- After a merge, prod deploys automatically (~3–4 min). Verify the change
  ON PROD (`scripts/prod-audit.mjs` with `EXPECTED_SHA`, plus a check
  specific to the change), testing never-seen URLs because stale ISR entries
  persist briefly.
- Do not run `vercel --prod` or redeploy the same SHA after a normal merge.
  GitHub verifies the PR and Vercel owns the one production build. Manual
  promotion or rollback is only for recovery and must identify the immutable
  deployment being promoted.

## Branch & PR conventions

Work on `claude/<topic>` branches off CURRENT `origin/main` (fetch first;
deploy-wait scripts often leave the checkout on a stale branch). One concern
per PR. Commit messages explain the WHY and cite the audit/issue they close.

When one session orchestrates several agents:

- Land doc changes first and base every worktree on the session branch tip
  that carries them, not an older `origin/main`.
- Briefs cite doc lines as `path:line` instead of paraphrasing them.
- Never pass "owner decisions" that are not recorded in the repo; record
  them here first or mark them pending.
- Fix the docs that agents flag as stale in the integration commit.
