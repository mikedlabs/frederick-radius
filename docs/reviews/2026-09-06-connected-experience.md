# Frederick Radius: connected local tasks

Local implementation review, September 6, 2026. Release status: **not deployed**.

## Product direction

Radius should help someone make a local decision and carry it through. Its advantage is connecting a county place or event to the right date, geography, source, and practical action. Today starts that work; Search and Ask use the same local information; Map explains location; details support the next action.

Three directions were considered: a larger personalized Today feed, an Ask-led home screen, and a task-led opening with connected results. The task-led direction makes useful capabilities immediately available to a first-time visitor, without account or location permission. It also keeps the locked four-tab navigation and existing shared search rather than adding another launcher.

| Surface | Purpose and implementation decision |
| --- | --- |
| Today | Start a useful task. Find, manual area, and immediate place decisions lead; weather and the future Fair promotion support them. |
| Search | Compare direct matches, with visible area and result-type refinement. Preserve those decisions when leaving results. |
| Ask | Handle a question or plan that needs explanation. Keep the requested scope, time, and hard constraints visible through recovery. |
| Map | Orient and select within actual county geography. Keep ordinary Map clean; show a return link only when arriving from Search. |
| Events | Compare date, venue, town, and timing confidence; put attendance actions at the point of selection. |
| Saved | Resume a prior decision, including the chosen collection and reading position. Retain usable saved records through refresh failure. |
| Compass | Keep the existing grouped tool directory as a secondary destination. No new parallel launcher. |
| Pulse | Keep the existing source-backed conditions and practical impact. Live inspection showed useful closure and freshness context; no redesign was needed for this release. |

## Verified starting point

The user's checkout was preserved with its existing work. It was behind current main, so implementation started in an isolated worktree on `codex/connected-local-experience`, based on `303dde2d3c7168ef8f67ca16619e888f98ead6dc`. Production's health endpoint reported the same revision. The Vercel deployment was READY (`dpl_HwD1gBBtBxdZAkRXTkwHaPyoFhZE`).

The review covered live Today, Map, Events, Saved, Ask, Search, Compass, Pulse, place details and practical attendance tools. Existing source and architecture documentation was checked against the current loaders.

Concrete problems observed:

- On production, `coffee in Brunswick` produced 50 mixed results, including Frederick businesses above the intended town. The shared qualified search logic existed but the full Search page used a less useful entry point.
- Today put a future Fair campaign and weather above the general task entry. Its title said Frederick even when the intended coverage was the county.
- A two-hour Brunswick question could be interpreted as an event search with no useful next step. Review also caught the separate `next two hours` form bypassing current-hour requirements.
- Returning from a place, a map selection, or a saved collection did not consistently restore the question, area, expansion, and comparison position.
- Event selection separated practical attendance information from the decision. Some proximity labels implied walking times without a route calculation.

## Changes implemented

**Composition and visual system.** Today now has a deliberate task opening, a native manual town selector, larger readable type, four useful task links and a compact future Fair treatment using the existing owned photograph. Desktop gives supporting conditions their own column. Search uses readable 18 px titles, town and branch context, fewer repeated type badges, and small category marks when photography fails. Events use compact date-led cards when photographs are missing. Public Sans, the current brand tokens, existing Ripple marks and the four tabs remain consistent.

**Retrieval and constraints.** The full Search page now uses canonical qualified retrieval. Named town, requested event date/time and result type participate in matching. The bounded event archive makes current event titles available. Official civic actions lead complete resident-service questions. The search corpus includes existing address, postcode and amenity information; no new provider or paid ingestion was enabled.

**Connected navigation.** Search serializes effective scope and selected type. Map, details and Events links carry the relevant origin and constraints. Session-only state restores Search expansion and scroll, and Saved collection/expanded-card/scroll. Return URLs are validated against an allowlist. Ask accepts explicit URL scope and retains it on reload and sharing.

**Trust and imperfect data.** Expired events are filtered, missing event end times remain explicit, and multi-day events ask people to check daily hours. Event summaries join canonical venue coordinates and owner cancellations. Unsupported walking-time and free-admission assumptions were removed. Immediate plans require availability evidence; recovery offers explicitly unscheduled places to check without silently satisfying hard constraints. A failed map renderer retains the searched town's results; failed saved refreshes preserve cached cards and expose Retry.

**Actions.** Event sheets expose Tickets, Directions, Calendar, Share and nearby garage information with the venue and time. Place and official-resource actions remain directly available. Search now uses the existing privacy-bounded decision telemetry for result opens and the lead result impression, with public identifiers and fixed enums rather than query text in those attributes.

## Journey evidence

These are observed browser outcomes, not evidence of user preference. Dynamic content can differ between production and the local environment.

| Journey | Before | After and completion boundary |
| --- | --- | --- |
| First visit: next two hours | A Brunswick afternoon request fell into an empty event answer. | Ask keeps Brunswick and two hours. If current hours cannot support a timed plan, it explains that limit and offers contactable unscheduled options. Missing live safety readings can instead lead with the existing conditions guard and an indoor-options action. A verified timed itinerary remains unavailable where hours are missing. |
| Resident: official service | Full Search could mix a resident task with fuzzy local matches. | The supported pothole resource appears as the official first action, without a competing generic Ask recommendation. |
| Compare outside downtown | Brunswick coffee returned a long list containing other towns. | Three Brunswick coffee results; switching to Thurmont, direct links and reload preserve the intended area. No separate filter setup is required before seeing town matches. |
| Event attendance | Practical travel information required more searching, and some labels inferred walking time. | The event sheet shows venue/town and time alongside tickets, directions and a named garage. Keyboard focus remains in the sheet and returns to the selected event on Escape. |
| Search to Map and back | Origin and comparison context could be lost. | Query, result type, town, selected place and map state survive the appropriate transitions. Expanded Search rows and scroll restore on return. |
| Reopen Saved | Leaving a collection could lose its expanded state or reading position. | Collection and selected-card state restore after detail/back and reload. |
| Permission or source failure | Missing location/source information could interrupt a useful path. | Denied location retains manual town selection. Renderer failure retains scoped results. A 503 saved refresh retains known cards and exposes Retry. |

## Data findings and remaining coverage

The promoted catalog contains 1,570 active places with unique slugs and Google identifiers: 854 in Frederick and 716 elsewhere. Of those records, 173 have at least 40 characters of decision copy (a completeness heuristic, not a quality rating), 1,328 have photo coverage and 1,435 have an action. Existing identity was preserved; vestigial database catalogs were not used.

Production's public health endpoint reported 75 tracked sources: 23 current, 4 stale, 8 requiring attention and 40 unknown. Current-hour refresh is intentionally held by provider policy, with zero fresh hourly refresh records. Stored published schedules are not equivalent to current verified hours. This release does not resume paid refreshes or claim to repair that coverage gap.

The committed venue snapshot and the runtime event archive are different sources with different freshness. The runtime archive is used through the canonical bounded loader; a degraded archive receives an explicit incomplete-results notice. Missing event ends and schedules remain limitations.

The production lexical index had 1,570 records and no vectors. The improved corpus builder requires the existing controlled index publication after release; no production index write or embedding job was run. Improving names and factual fields comes before buying a larger model or new data service.

## Validation and release evaluation

Final checks and measured laboratory results are recorded with the visual evidence in the accompanying handoff. Required checks include the full unit suite, typecheck, changed-file lint, style lint, production build, broad UX/axe gate, and the connected browser journeys.

Evaluate a release with a small set of aggregate measures:

1. Successful next-action signals, separated into directions, calls, official websites, tickets/reservations and saves. An outbound click is an action signal, not proof of attendance or a completed purchase.
2. Result opens and lead-result impressions by surface and entity type. Do not divide unrelated event populations into a conversion rate or call them unique people.
3. Unresolved needs: empty/error responses, negative answer feedback and missing availability, reviewed by coarse intent and area only where existing collection and privacy rules permit.
4. Return continuity and responsiveness: repeat the named browser journeys and track field performance after release. Local laboratory timings cannot establish production INP or user preference.

No merge, deployment, paid refresh, schema migration or production index write has been performed. Physical installed iOS/Android behavior and the real onscreen keyboard require device verification; emulated touch, viewport and reduced-motion checks are a narrower claim.

The data review verified canonical identities, coverage, geographic placement and the relevant timing/action contracts. It did not certify every external business website or independently verify every catalog description. The local server has the existing public Mapbox token but no production server credentials; private data services and paid photos may therefore show the explicit fallback states visible in the screenshots.

## Final checks

- Full regression suite: 959 passed test files, one skipped; 7,516 passed tests and two skipped.
- Production build: passed, including the artifact, source, county, automation and budget guards.
- TypeScript and changed-file ESLint: passed. Style lint scanned 858 files with zero new violations.
- Required UX gate: 50 browser render/accessibility and safe-interaction checks passed.
- Connected built-browser suite: 19 passed initially; two tests reached the correct destination but expected the old URL without return context. Both now assert the canonical path, preserved return context and working Back link, and pass.
- Visual contract: 12 captures passed after correcting the stale Today clock and outdated control labels in the fixture. Mac captures were reviewed; no Linux baseline was promoted.
- Specialist checks additionally covered event attendance keyboard focus and eight mobile WCAG A/AA states with no violations, plus component stories and focused contract tests.

## Mobile laboratory measurements

Three runs per route, local production build, Chromium at 390 x 844 with touch input, warm server and a fresh browser context per navigation. CDP requested 150 ms latency, 1.6 Mbps down, 750 Kbps up and fourfold CPU slowdown. The table reports medians; observed LCP/CLS were sampled 2.5 seconds after fonts and primary content. Local server response times do not represent production network latency. These are neither Lighthouse scores nor real-user INP measurements.

| Route | First content | Observed largest paint | Layout shift |
| --- | ---: | ---: | ---: |
| Today | 1.06 s | 1.06 s | 0.0000 |
| Search, all matches | 0.99 s | 0.99 s | 0.0000 |
| Search, places | 0.99 s | 0.99 s | 0.0000 |
| Events | 1.00 s | 3.81 s | 0.0029 |
| Map opening content | 1.04 s | 1.04 s | 0.0013 |
| Saved | 1.01 s | 1.01 s | 0.0000 |
| Ask | 0.98 s | 0.98 s | 0.0000 |

The map opening paint is not map readiness. Its initial observed resource transfer was about 2.8 MB; a separate readiness measurement accompanies the evidence. Events painted its largest element later than the other non-map surfaces, at about 3.8 seconds. These deserve attention when evaluating the release on production and physical phones. The local environment lacks the production server credentials, so source and media fallback behavior also limits any comparison to production.

Separate map readiness: **18.27 seconds median** under the same requested throttling, with the renderer becoming ready in all three runs. This is a material remaining slow-connection limitation. It has not been proven to be a regression because an equivalent production-baseline readiness measurement was not made. Scoped search/fallback rendering was improved, but the initial map payload still needs a dedicated performance pass before calling the overall map experience fast.

Final remote-main check still matched the original base revision. The user checkout remains preserved. All application changes are local to the isolated branch; no preview deployment was created.
