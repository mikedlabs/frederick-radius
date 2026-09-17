# Frederick Radius — agent guide

A current local information app for Frederick County, MD (12 incorporated municipalities
plus Urbana). Next.js App Router on Vercel · Supabase · Mapbox GL ·
Google Places. Production: https://frederickradius.app

## Design system — this is the truth, not older specs

The canonical brand guide is `docs/brand/BRAND_GUIDE.md`; the printable visual
guide is `docs/brand/Frederick-Radius-Brand-Guide.html`, which is
hand-maintained — no script writes it, and `npm run build:brand-guide` renders
it to a PDF rather than authoring it. Edit it yourself when the identity
changes, keeping its palette, names, and version line matching
`src/lib/brand.ts`, because `npm run build:brand` fails otherwise. The code source of
truth is `src/lib/brand.ts`, mirrored by the `--app-*` tokens in
`src/app/globals.css`.

- **Type:** Libre Caslon Display Regular carries the wordmark and rare
  editorial or campaign moments. Public Sans carries product page titles,
  section titles, body copy, navigation, controls, labels, times, distances,
  and tabular numerals. Public Sans may use its real variable italic. There is
  no third technical typeface and no faux bold or italic Caslon face. Legacy
  `.font-serif` maps to Public Sans. Use `.font-brand` for the wordmark and
  `.font-editorial` only for a deliberate editorial hero.
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
- **Mark:** use `RippleMark` or an exported asset from `public/brand`. The full
  three-arc mark is for 48 px and larger, the compact two-arc mark is for
  24–47 px, and the one-arc favicon is for smaller sizes. Do not redraw it,
  wrap it in the retired circle, or invent a page-specific logo.
- **Surface:** Cream is the normal product canvas. Ink is a rare contrast
  moment, not a default page theme. Beer, Live conditions, All tools, and every other
  product surface keep the same identity rather than inventing a palette.
  `/pitch` is an isolated internal presentation; if it becomes public-facing,
  bring it into the Frederick Radius Brand System before release.
- **Voice:** calm local expert. No em dashes in user-facing copy
  (`cleanFeedText` converts them). Verb-first chip labels ("Eat & drink",
  "Open now"). Counts are supporting detail, never the headline. Full rules
  + banned-words list + worked copy per surface: `docs/VOICE.md` (the
  source of truth — no metaphors, say the true thing plainly). Canonical
  tagline: "Frederick County starts where you are."
- **Sentence discipline:** User-facing prose uses complete grammatical
  sentences. Do not manufacture a casual voice with clipped fragments or
  stacks such as "Good beer. Good people. Right now." Headings, buttons, and
  data labels may be short phrases when they are clearly interface labels.
- **No automatic rhetorical groups of three:** Do not default to three clauses,
  benefits, adjectives, or matching short sentences because the rhythm sounds
  polished. This is a prose rule, not a product limit. Three results, choices,
  steps, cards, or facts are correct when the data or task calls for three.
- **Aesthetic bar:** a distinctive local information tool — organized, calm,
  and immediately useful.
  Typography carries hierarchy before boxes/borders/badges. One primary
  action per view. Honest empty states. If a change reads like a generic
  SaaS template, it's wrong.

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

## Locked architecture (do not restructure)

The interaction rules that keep this capability-dense app understandable are
documented in `docs/USER_FIRST_INTERACTION_CONTRACT.md`. Preserve its single
request doorway, explicit location scope, one-overlay limit, and origin-aware
Back behavior when adding or changing tools.

- /map is the clean whole-county browse surface by default (owner call
  2026-07-08: "the map IS the page" — the Nearby/Whole-county toggle pill
  was removed as clutter). A first-time visitor may see one consent sheet
  offering **Use my location** or **Browse county**; it explains the benefit
  before any browser prompt. After that, the shared header location control is
  the sole Near me / Whole county / town scope control. Do not add another
  floating Locate or scope toggle to the map. Radius ("Nearby") mode still exists behind
  `/map?mode=radius` (isochrone + control sheet) but has no UI entry point;
  don't re-add the floating toggle without an owner ask. The nav is FOUR
  tabs, `Today · Map · Events · Saved(/my-radius)`, from ONE source of
  truth (`src/components/nav/tabs.ts`). Ask is deliberately NOT a fifth
  tab: it lives at `/ask` as a focused workspace, reached from Today's
  compact launcher and from Compass. The old `/guide` URL redirects to
  `/ask`, so don't link `/guide` in new code.
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
  it; never count events from a different query. During application builds it
  deliberately reads only promoted curated + venue snapshots; publisher feeds
  rejoin through the same assembly at runtime.
- **After changing place data or its cleaning:** regenerate the client
  dataset — `npm run build:client-places` (search/map/funnel read
  `places-client.json`, not the loaders), run its gates, then update the
  reviewed release stream with `npm run data:release:write -- --stream places`.
  Application builds validate committed artifacts and never regenerate them.
  Lesson of PR #503.
- **After changing how CACHED data is cleaned/shaped:** bump the
  `unstable_cache` key (e.g. `ingested-series-vN`) — the cache persists
  across deploys. Lesson of PR #509.
- **The Postgres `places` and `events` tables are NOT the catalog.** Do
  not read them. `schema.places` is write-only — seeded once by
  `src/lib/db/seed.ts` and read by nothing at runtime — and it holds
  a stale partial copy (1,479 rows at the July 2026 audit) with no
  overrides applied, against a file catalog that moves with every data run
  (1,570 as of 2026-09-16).
  `schema.events` is likewise vestigial (44 rows); the live event
  pipeline is `ingested_events` via `unifiedEvents.ts`. Places come from
  `src/data/places-client.json` (client surfaces) or
  `src/lib/loaders/places.ts` (server). Querying the tables looks
  perfectly reasonable and silently returns a stale, incomplete catalog,
  which is exactly why this warning exists. Audited July 2026.
- **The local search index must never depend on memory.**
  `radius_search_documents` is filled incrementally by the gated
  `/api/cron/radius-search` job and can be bootstrapped immediately with
  `npm run build:radius-search` (both need `DATABASE_URL`; `OPENAI_API_KEY`
  optionally adds semantic vectors). Full-text search is the required
  baseline. AI Gateway offers embedding models, but the current scheduled
  writer imports the direct OpenAI provider and requires `OPENAI_API_KEY` when
  vectors are deliberately enabled. Do not infer transport support from the
  provider catalog or from Ask's text-generation credentials. The larger
  reason not to rush vectors is still the corpus, though the shape of the
  problem has changed since #1681 enriched it. Measured 2026-09-16 over all
  1,570 documents: they average 150 characters, median 137, and only 47 are
  under 100 — but 1,388 of 1,570 are still under 200, and the growth is mostly
  address and postal-code boilerplate that appears on nearly every document.
  What would actually distinguish them is still missing: `place.amenities` is
  read by the builder and populated for ZERO places, only 14 places carry
  `search_aliases`, 3 carry a description, and 1 carries `known_for`. So
  embedding this corpus still yields ~1,500 near-identical "restaurant in
  Frederick" vectors whose cosine ranking is close to arbitrary. Enrich the
  documents first; vectors are worth buying only once there is something in
  them to embed. (Do NOT re-add a note that aliases are missing from the
  indexed document — they were added in #1634 and are at
  `src/lib/ask/search-index-document.ts:38`; that claim sent agents to redo
  finished work.)
  `hybridPlaceSearch()` fails soft to `[]`, so an EMPTY index is
  indistinguishable from a healthy one at the call site — it shipped empty
  and Ask ran keyword-only for months before anyone noticed. Keep
  `RADIUS_SEARCH_CRON=1` in Vercel Production; the `semantic-index`
  tripwire makes empty or badly stale coverage red on /admin/data-health.

## Verification norms

### Component workshop

- Reuse the shared primitives documented in Storybook before inventing a new
  card, button, chip, heading, empty state, or drawer treatment. Run
  `npm run storybook` and inspect the real mobile states at 320, 375, 390, and
  430 pixels.
- Any change to a shared UI primitive must update or add its story and pass
  `npm run test:storybook`. Storybook's accessibility checks fail the component
  test instead of leaving a warning for someone to notice later.
- When Storybook is running, agents can inspect the component catalog through
  the local `storybook` MCP server in `.mcp.json`. This is a development tool;
  it is not included in the production application.
- Use `npm run test:visual:capture` to review Find, Ask, and map changes. Only
  reviewed Linux/Chromium references become blocking baselines; never promote
  a macOS font-rendering difference into CI by accident. See
  `docs/VISUAL_CONTRACT.md`.

- `npx tsc --noEmit` · `npx eslint <changed files>` · `npx vitest run`
  must pass before any commit.
- **Lockfile edits: regenerate with `npx -y npm@10 install`, never bare
  `npm install`.** CI pins node 22, whose npm 10 rejects locks written by
  npm 11+ ("Missing: <pkg> from lock file" in `npm ci`). A lock written by a
  newer local npm poisons every CI job including main's, and it reads like a
  branch conflict when it is a version skew. Learned 2026-08-20 after it
  broke four PRs and then main itself.
- `npm run test:ux` (Playwright: render health + axe WCAG A/AA on every
  key surface, pinned at ZERO violations) before any commit that touches
  UI. Sandboxes with a preinstalled Chromium: set `PW_CHROMIUM_PATH`.
- CI `verify` and `style-lint` RUN and are REQUIRED on main's ruleset — a
  red one blocks the merge, including the nightly data PRs. (An older note
  here claimed they were permanently red from account-level Actions limits;
  that was true once and stale by 2026-08-19, and believing it means
  shrugging at real failures.) Local runs remain the fast pre-commit gate.
- After a merge, prod deploys automatically (~3–4 min). Verify the change
  ON PROD (`scripts/prod-audit.mjs` with `EXPECTED_SHA`, plus a check
  specific to the change). Stale ISR entries persist briefly
  (stale-while-revalidate) — test never-seen URLs for fresh behavior.
- Do not run `vercel --prod` or redeploy the same SHA after a normal merge.
  GitHub verifies the PR and Vercel owns the one production build. Manual
  promotion or rollback is only for recovery and must identify the immutable
  deployment being promoted.
- Tap targets: ≥44px effective. Small controls use the invisible
  extender — `.tap-44` (globals.css) or a `before:` overlay (Pill).

## Branch & PR conventions

Work on `claude/<topic>` branches off CURRENT `origin/main` (fetch first
— deploy-wait scripts often leave the checkout on a stale branch). One
concern per PR. Commit messages explain the WHY and cite the audit/issue
they close.
