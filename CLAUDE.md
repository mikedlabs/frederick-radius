# Frederick Radius — agent guide

A current local information app for Frederick County, MD (12 incorporated municipalities
plus Urbana). Next.js App Router on Vercel · Supabase · Mapbox GL ·
Google Places. Production: https://frederickradius.app

## Start from the reviewed code

Before editing, inspect the checkout's branch, revision and local changes, then
compare it with current `origin/main`. Several preserved worktrees contain older
unfinished designs. Declare one release checkout and branch for the task;
reconcile useful patches from older work without resetting unrelated changes.
An edit in another folder or an open PR is not a live update. Verify the exact
merged revision, ready deployment and public behavior before calling it live.

## Design system — this is the truth, not older specs

These describe the currently approved design. When the owner authorizes a
design change, update its tokens, guide and relevant visual contracts together.
Preserve contrast, usable touch targets, focus, Back continuity and reduced
motion while changing the appearance; old implementation details are not a
reason to abandon an approved improvement.

The canonical brand guide is `docs/brand/BRAND_GUIDE.md`; the printable visual
guide is `docs/brand/Frederick-Radius-Brand-Guide.html`, which is
hand-maintained — no script writes it, and `npm run build:brand-guide` renders
it to a PDF rather than authoring it. Edit it yourself when the identity
changes, keeping its palette, names, and version line matching
`src/lib/brand.ts`, because `npm run build:brand` fails otherwise. The code source of
truth is `src/lib/brand.ts`, mirrored by the `--app-*` tokens in
`src/app/globals.css`.

- **Type:** Product UI uses System sans from the device:
  `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`. This includes
  page titles, text, controls, source notes, and tabular data. Public Sans
  remains the installed print/export text family, with its real variable
  italic. Libre Caslon Display Regular remains the wordmark and rare
  editorial signature. Do not synthesize bold or italic Caslon, rename
  packaged Public Sans as a system font, or download a new family.
- **Palette (Brand System 1.4, October 16, 2026, owner-approved):** Always use
  `var(--app-*)` in app UI. White `--app-bg #FFFFFF`, Charcoal `--app-ink #22221F`,
  Deep Coral `--app-brand #C34335`, and soft gray inset surfaces `#F4F4F3` form
  the light shell. Existing `BRAND.colors.cream`, `.ink`, and `.brick` are
  compatible keys for White, Charcoal, and Deep Coral. Dark appearance is an explicit saved choice and uses `darkCanvas #1C1C19`, `darkSurface #292925`,
  `darkInk #F7F7F4`, `darkMutedInk #C1C1B8`, `darkBorder #464640`,
  `darkControlBorder #A5A59A`, and `darkLink #FFAAA0` from the contract.
  Use theme-readable text and control tokens; light coral link fills need
  dark text. Catoctin Forest `#315A43` stays a terrain/outdoor/positive cue;
  Creek `#285D73` stays civic/map/transit/data; Plum `#7E2C6F` stays a limited
  cultural accent. Ochre Amber `#C58A32` retains live/caution/sunlight and
  Beer-specific meaning. Semantic colors do not become shell themes.
- **Mark:** use `RippleMark` or an exported asset from `public/brand`. The full
  three-arc mark is for 48 px and larger, the compact two-arc mark is for
  24–47 px, and the one-arc favicon is for smaller sizes. Do not redraw it,
  wrap it in the retired circle, or invent a page-specific logo.
- **Surface:** White and soft gray are the normal light surfaces. Dark appearance
  uses the separate dark canvas and surface tokens throughout the same app.
  Favor clean surfaces, clear type, and accurate local photography over paper
  grain or palette washes. Specialty pages share this identity and preserve
  their semantic signals. `/pitch` stays an isolated internal presentation;
  bring it into the current brand system before public use.
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

## Architecture and interaction contracts

The interaction rules that keep this capability-dense app understandable are
documented in `docs/USER_FIRST_INTERACTION_CONTRACT.md`. Preserve its single
request doorway, explicit location scope, one-overlay limit, and origin-aware
Back behavior when adding or changing tools.
These describe the current interaction model, not a ban on refactoring or
owner-authorized UX changes. When an approved task changes the behavior,
update its implementation, relevant contract and tests together.

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
- **One canonical event pipeline:** `src/lib/loaders/unifiedEvents.ts` assembles
  curated, iCal, Ticketmaster, Bandsintown and venue records for the owned
  warm/archive jobs. Public Today and Events use the bounded canonical archive
  readers in `src/lib/loaders/todayEventSnapshot.ts`, with honest degraded
  states and promoted fallback records. Keep live publisher fanout out of the
  visitor path. Application builds use reviewed promoted artifacts, validate
  them and never refresh live sources.
- **After changing place data or its cleaning:** regenerate the client
  dataset — `npm run build:client-places` (search/map/funnel read
  `places-client.json`, not the loaders), run its gates, then update the
  reviewed release stream with `npm run data:release:write -- --stream places`.
  Application builds validate committed artifacts and never regenerate them.
  Lesson of PR #503.
- **After changing how CACHED data is cleaned/shaped:** bump the
  `unstable_cache` key (e.g. `ingested-series-vN`) — the cache persists
  across deploys. Lesson of PR #509.
- **The generic Postgres `places` and `events` tables are not the public
  catalog.** Seed code and retained legacy ingestion endpoints can write these
  tables without publishing a place or event to the app. Do not wire a public
  catalog reader to them or report those writes as a public update. Places
  come from the reviewed committed files through `places-client.json` (client)
  and `src/lib/loaders/places.ts` (server). Event jobs assemble normalized
  records and publish the canonical archive; public readers use
  `event_canonical_records` through the bounded archive loader. Operational
  audits may inspect the legacy tables to diagnose or retire old writers.
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
- Use the provider-free and renderer-enabled capture commands in
  `docs/VISUAL_CONTRACT.md` to review Find, Ask, and map changes. A provider-free
  capture does not prove that a styled map rendered. Only
  reviewed Linux/Chromium references become blocking baselines; never promote
  a macOS font-rendering difference into CI by accident. See
  `docs/VISUAL_CONTRACT.md`.

- During iteration, run the focused tests that cover the change and ESLint on
  changed source files. Run typecheck for TypeScript or interface changes.
  Run the full unit suite once on the completed application PR candidate.
  After a narrow follow-up, rerun affected checks; repeat the whole suite only
  for a new failure, broader change or unresolved risk. Required hosted CI
  still validates the exact final revision before merge.
- **Lockfile edits: regenerate with `npx -y npm@10 install`, never bare
  `npm install`.** CI pins node 22, whose npm 10 rejects locks written by
  npm 11+ ("Missing: <pkg> from lock file" in `npm ci`). A lock written by a
  newer local npm poisons every CI job including main's, and it reads like a
  branch conflict when it is a version skew. Learned 2026-08-20 after it
  broke four PRs and then main itself.
- Use focused browser/component checks during UI edits. Run `npm run test:ux`
  once on the completed UI release candidate for render health and zero
  axe WCAG A/AA violations across key surfaces. Narrow documentation or policy
  follow-ups do not require another complete UI run. Sandboxes with a
  preinstalled Chromium: set `PW_CHROMIUM_PATH`.
- CI `verify` and `style-lint` RUN and are REQUIRED on main's ruleset — a
  red one blocks the merge, including the nightly data PRs. (An older note
  here claimed they were permanently red from account-level Actions limits;
  that was true once and stale by 2026-08-19, and believing it means
  shrugging at real failures.) Local runs remain the fast pre-commit gate.
- After a merge, Vercel owns the automatic production build. Verify the change
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

Work on `codex/<topic>` branches off CURRENT `origin/main` (fetch first
— deploy-wait scripts often leave the checkout on a stale branch). One
concern per PR. Commit messages explain the WHY and cite the audit/issue
they close.
