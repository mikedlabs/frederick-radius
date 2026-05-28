# FrederickRadius: Cleanup and Expansion Plan

Working plan for the cleanup, expansion, and UI/UX work. Phases run in
order. Each phase ends with a commit and passing `typecheck`, `lint`,
`build`. It is fine to stop after any phase and report.

## Hard constraints (every phase)

- Sanitize data at ingest, never in render components.
- Store generated values (slugs) as fields. Never recompute the same
  derived value in two places. For live feeds that have no database,
  "store" means compute once in the normalize pipe and carry it on the
  object for that request, never recompute downstream.
- Keep existing shared links alive with redirects when slugs change.
- Do not expose API keys client-side. Proxy external calls through
  server route handlers or server components, and cache responses.
  Feature-flag any data source whose env key is absent so a missing
  key never breaks the build.
- Writing rules for all user-facing copy: every sentence has a subject
  and a verb, no fragments posing as punchy copy, no em dashes, do not
  use "craft," "crafting," or "soothing," and use "team" not "staff."

## Already done (do not redo)

Nav single source of truth (`src/components/nav/tabs.ts`), the UTC
event-time display fix (`src/lib/format/eventTime.ts`),
`dedupeCuratedClusters`, the Memorial Park duplicate fold, the seasonal
event gate, and the empty-state copy. Build on these.

## Architectural decisions (settled before Phase 1)

1. The normalize pipe outputs the EXISTING event shape, extended. The
   app already has one canonical type, `EventWithMeta = Event & {...}`
   in `src/lib/loaders/events.ts`, consumed by ~20 components. Do NOT
   fork a parallel `EventNormalized` type. Extend `Event` with the new
   fields (`presenter`, `verified`, `recurrenceKey`, stored `slug`) and
   make `normalizeEvent` the single front door that produces that shape.
2. Reuse existing parsers. `ical-live.ts` already has `parseICalDate`
   with TZID-to-instant handling, and `eventTime.ts` formats instants
   in `America/New_York`. The normalize pipe RESOLVES the instant and
   reuses these. It does not fork a third date library or formatter.

---

## Phase 0: Deploy current work

Local `main` is ~17 commits ahead of `origin/main`, so the live site is
missing every recent fix. Shipping is the highest-value first step.

1. Run `typecheck`, `lint`, `build`. Fix anything broken.
2. Smoke test locally: municipal events render in `America/New_York`,
   nav resolves through `tabs.ts`, `/radius` redirects to
   `/map?mode=radius`.
3. Push to `origin/main`, confirm the Vercel deploy succeeds.
4. Re-verify the smoke items on the live URL.

Acceptance: live site reflects current `main`, event times correct, nav
and redirect working in production.

Note: the `eventTime.ts` helper predates the 17 commits, so confirm the
commit that migrated `SeriesCard` onto it is in the push. If municipal
times still read wrong after deploy, Phase 1 is the true fix.

## Phase 1: Event normalization layer (the backbone)

Every event from every feed passes through one ingest pipe before it is
stored or rendered. `SeriesCard` today renders `series.category`,
`series.address`, and the source name raw, which is why HTML entities,
concatenated addresses, and department-as-category strings are live.
Fix at the source.

Create `src/lib/events/normalize.ts` exporting
`normalizeEvent(raw, source)`, with a per-source adapter pattern. Build
adapters only for feeds that exist today; stub the rest. The pipe
output is the extended `EventWithMeta` shape (see decision 1).

Transforms inside the pipe:

- Timezone. Resolve each source's timestamp to a correct instant via
  the existing `parseICalDate`. Produce an unambiguous ISO instant.
  Display continues through `eventTime.ts`.
- Entity decode. Decode HTML entities and strip stray tags from
  `title`, `venueName`, `address`.
- Address format. Insert ", " where a street type runs into the city.
  Handle St, Ave, Rd, Dr, Ln, Blvd, Ct, Pike, Way before a capital,
  and normalize spacing before the ZIP.
- Title cleanup. Add spaces around hyphens between word characters.
  Split "Organization-Event Name" into `presenter` and `title`. Strip a
  trailing four-digit year the date already implies.
- Category mapping. Lookup from raw source department or type to the
  app taxonomy. Map "Workforce Services," "Tourism," "Health & Human
  Services," "Public Meetings," "Town Events," "Parks & Recreation,"
  etc. Default unknown government feeds to Civic, everything else to
  Other. Never render the raw department.
- Dedup and recurrence. Build `recurrenceKey` from normalized title
  plus venue plus weekday and time. Collapse to one series with a date
  list, on both the municipal path and the live iCal daily-recurring
  path (which does not collapse today).
- Slug. `kebab(presenter + title) + "-" + yyyy-mm-dd`, numeric suffix
  on collision. Stored on the event.
- verified. Curated and ticketed sources true, raw feeds false.

Refactor `SeriesCard` and the curated list to render only from the
normalized fields.

Acceptance: no HTML entities, concatenated addresses, or
department-as-category strings appear in the events UI. Recurring
live-feed events collapse to one card.

## Phase 2: Slug rebuild (stored, not recomputed)

`liveEventSlug()` mashes title, venue, and timestamp, and the detail
route resolves by recomputing it.

1. Generate the slug once in the normalize layer and store it.
2. Resolve the detail route by the stored slug field.
3. Old-to-new redirects. Enumerable for stable-identity events (seed,
   curated). For live events whose feed content shifts, keep
   `liveEventSlug()` as a fallback resolver rather than a redirect map.
   Serve 301s via a catch-all route handler, not a giant next.config
   table.
4. Add new slugs to the sitemap, remove the old ones.

Acceptance: no slug contains `live-`, a mashed address, or a bare
timestamp. New URLs resolve. Previously shared URLs redirect.

## Phase 3: Radius-map hover and smoothness

`RadiusMap.tsx` renders dots as a circle layer with no hover popup, no
cursor change, no feature-state, and the pan feels rough. Also the
direct bug the owner reported.

1. Stable feature ids (`generateId: true` or assigned) for
   feature-state.
2. `mousemove` and `mouseleave` on the dot layer: popup with name and a
   short detail, `cursor: pointer`, feature-state hover style. Reuse
   the popup visual the browse `AppMap` already has.
3. Tap-to-select with the same popup for touch.
4. Recompute the in-view list on `moveend`, not `move`. Use `easeTo`
   for programmatic camera changes.
5. Confirm the dot GeoJSON carries `name` and `category` props.

Acceptance: hovering a dot shows its name and changes the cursor, the
map pans smoothly, tapping a dot on mobile selects it.

## Phase 4: Polish sweep

1. Em dash sweep across user-facing strings, content, metadata. Replace
   with the correct punctuation. Skip vendored files. The `style:lint`
   script may already cover part of this; extend it.
2. Map skeleton. Render the basemap immediately, skeleton the in-view
   list while data loads, remove the instructional caption once the
   filter bar and list header carry the meaning.
3. Pulse label. Self-explanatory label plus tooltip.
4. Meta alignment. Single author ("MAD Productions") across routes.
   Replace the generic Twitter description with the homepage meta
   description. `/api/og` reflects live content with a date-keyed cache.
   Confirm the unified `theme-color` ships.
5. Homepage hero. One primary answer about what is worth the user's
   time now. Collapse secondary weather behind one tap (continues the
   wallet-card de-emphasis). Hero string becomes a real sentence. Move
   the "From Above" book promo to a labeled zone near the footer.

Acceptance: no em dashes in copy, basemap shows immediately, Pulse
explains itself, metadata consistent, homepage leads with one answer.

## Phase 5: New data sources

Server-side adapters through the normalize layer or map layers. Cache
responses, feature-flag each on its env key, never expose keys
client-side. Order by value.

Reality check: CHART, NWS alerts, PulsePoint, FirstEnergy, Ticketmaster,
AirNow, and TransIT GTFS already exist in the tree. For those, the work
is "route the existing source through the normalize pipe and verify
filters," not a fresh integration. The genuinely net-new, high-value
sources are MARC, GIS, NPS, and the OSM open-now honesty fix.

1. MARC Brunswick Line real-time (no key, net new). Static GTFS plus
   GTFS-RT trip updates, vehicle positions, and alerts. Probe the feed
   URLs live before building, as MTA Maryland has moved them. Decode
   protobuf server-side with `gtfs-realtime-bindings`, cache ~30s.
   "Next train" card for Frederick, Monocacy, Point of Rocks, Brunswick,
   plus a stations map layer.
2. Pulse honesty (existing sources). Verify CHART corridor filters
   (I-70, I-270, US-15, US-340, MD-26, MD-85) and NWS Frederick zone
   filters. "All clear" appears only when there are no active items.
3. Ticketmaster into the pipe (existing source). Route the existing
   pull through `normalizeEvent` with `verified: true` and a "tickets"
   tag.
4. County and City GIS layers (no key, net new). Parks, trails,
   parking, municipal boundaries, public restrooms as Mapbox sources,
   preferred over OSM for those layers.
5. OSM open-now honesty (net new). Stop asserting open or closed from
   unverified OSM hours. Assert state only on verified hours, else show
   "hours not confirmed." Dedup by name and proximity, hide nameless or
   categoryless records.
6. Optional scaffold if time allows: NPS for Catoctin and Monocacy
   (`NPS_API_KEY`), AirNow surfaced only on poor-air days (already
   integrated, just gate the surfacing).

Acceptance: each implemented source flows through the existing pipes,
gated on its env key, server-side, cached. MARC and Pulse should feel
like capabilities locals cannot get elsewhere.

## Phase 6: All-pages UI/UX pass

The cleanup phases above improve events, the map, the homepage, and
Pulse. They do not touch most pages. This phase moves every page, scoped
to the four highest-leverage changes so it does not balloon.

1. Outdoor-readability type floor (global). Body 15px minimum, metadata
   12.5px minimum with strong contrast, tap labels 13 to 14px, section
   headers 18 to 22px, card titles 16 to 18px. Audit thin gray text on
   tinted cards. This touches every surface at once and is the single
   highest-leverage change.
2. Consistent trust signal. One `SourceChip` plus the existing
   `FreshnessChip`, applied to place cards, event cards, and map
   amenities, so trust reads the same everywhere.
3. One card language. Codify utility, place, and event card types and
   apply them consistently, instead of each page styling cards its own
   way. Build on the `glance` event card already shipped.
4. The untouched high-traffic pages. Polish `/places/[slug]` (the page
   a shared link lands on) and `/m/[municipality]` town pages, which
   have not had a recent pass.

Plus the background-color consistency decision the review flagged:
commit to dark for utility surfaces and cream for content, or one
global value, deliberately.

Acceptance: a consistent type floor across pages, one trust signal, one
card system, and the two high-traffic pages brought up to the standard
of the rest.

## Definition of done

Live site reflects current `main`. No raw entities, concatenated
addresses, or department-as-category strings in the events UI. Recurring
events collapse. Slugs are clean and old links redirect. The radius map
has working hover and selection and pans smoothly. Copy contains no em
dashes and follows the writing rules. Pulse is meaningful. Metadata is
consistent. New sources flow through the normalize and map layers, gated
on env keys, server-side, cached. Every page meets one type floor, one
trust signal, and one card system.
