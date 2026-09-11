# Frederick Radius design and UX review

Audit date: July 14, 2026
Audit baseline: `24d2db6a2667af50642f5bcaf51926637dea24c1`
Status: Phases 0 through 3 are complete. No application code has changed. Phase 4 requires approval.

## Context and scope

Frederick Radius is an answer-first field guide for people who live in or visit Frederick County. It combines current conditions, places, events, civic information, maps, and saved items so a user can decide what to do without searching several local sources. The current application uses Next.js 16.2.6 and React 19, Tailwind CSS 4 plus a large custom CSS token layer, custom React components, Vaul drawers, Framer Motion, Mapbox GL, and Playwright (`package.json:5-21,81-137`).

The priority routes were:

1. `/today`
2. `/map`
3. `/events`
4. `/my-radius`
5. `/search?q=coffee`
6. `/places/brewers-alley-frederick`
7. `/events/alive-at-five-2026-07-16`
8. `/m/frederick`

`/beta` was captured as a supplementary acquisition and access flow. The current primary navigation is Today, Map, Events, and Saved (`src/components/nav/tabs.ts:43-47`). `/guide` is retired and redirects to `/today` (`next.config.ts:237-242`).

The locked brand constraints are the paper and ink foundation, signal vermilion, spruce, slate, almanac gold, the radius mark, Fraunces for editorial display, Inter for functional UI, JetBrains Mono for instrument-like data, and the calm local voice. The font implementation uses variable Next fonts, Latin subsetting, and `display: swap` (`src/app/layout.tsx:30-52`). Marketing, pitch, admin, authentication, data-ingestion behavior, and brand replacement are out of scope. The product CSS declares `color-scheme: light`, so there is no dark application theme to capture (`src/app/globals.css:336`).

### Repository status

The audit ran in a clean detached worktree at the current `origin/main` commit. The live service worker reported the same deployed commit, so the audit represents the current GitHub main branch and production site. The active Claude Code checkout at `/Users/miked/Projects/frederick-radius` is the correct repository, but its local `main` is at `18aa1605`, is 22 commits behind `origin/main`, and contains two modified beta-access files plus an untracked review folder. Those local edits do not reach the site automatically. Work reaches production after it is committed, pushed or merged to `main`, and Vercel completes its Git-integrated deployment.

### Method

- I read `CLAUDE.md`, `README.md`, `package.json`, `docs/VOICE.md`, `docs/DESIGN_TELLS.md`, and `docs/NORTH_STAR.md` before capture.
- I used the repository's existing Playwright 1.60 installation and an installed Google Chrome. I did not add dependencies.
- I captured all eight priority routes and `/beta` at 375 by 812, 768 by 1024, and 1440 by 900. The [baseline manifest](probes/baseline-summary.json) links 27 route and viewport probes. Full-page baseline and viewport screenshots live in `screenshots/`.
- I captured primary hover, focus-visible, loading, validation, remote-error, first-visit, skip-link, search-dialog, drawer, filter-panel, compact-list, map-list, map-loading, and no-result states. The evidence is in [interactive-states.json](probes/interactive-states.json) and [state-followups.json](probes/state-followups.json).
- I ran axe-core on all 27 baseline captures, completed a keyboard pass, measured target geometry and fixed chrome, recorded Layout Instability API entries, and inspected every screenshot.
- I built the production application successfully with `next build`. I ran three Lighthouse navigation passes at 375 by 812 with simulated mobile throttling. I reran Map twice with WebGL enabled after identifying that the first harness flags forced the unsupported-browser path.
- The exhaustive static source-match index is [token-source-evidence.json](probes/token-source-evidence.json). It includes every matched source line for type, color, arbitrary layout, radii, shadow, and motion candidates. It deliberately includes token definitions and documented exceptions so a migration can classify rather than silently discard them.

## Executive summary

Frederick Radius has a strong, recognizable field-guide identity, and its best screens feel specific to Frederick County rather than assembled from a generic component kit. The product's main weakness is not the brand direction; it is the accumulation of parallel UI systems, late client rendering, and unresolved accessibility details around that direction. The most urgent change is to assign tested foreground and background pairs to primary actions and civic-alert content, because 68 axe contrast failures include access, Save, and public-safety text. The second high-leverage change is to stabilize Events and Map: Events reproduces 0.249 CLS and roughly 10-second LCP, while Map wastes 55 to 127 vertical pixels and leaves a background OpenStreetMap request visible as LCP after roughly 9.6 seconds. The third high-leverage change is to restore one clear answer and one clear action surface: Search promises the nearest open coffee without naming it, and detail pages show duplicate or overlapping action layers below the desktop breakpoint. Accessibility needs a focused pass across Map marker semantics, Browse focus restoration, the skip target, filter semantics, headings, labels, and touch targets. The token system already contains good semantic foundations, but 45 type sizes, 315 raw color primitives or expressions, 73 spacing values, 24 computed radii, 137 shadow recipes, and 56 effective motion durations make consistent maintenance difficult. The recommended work preserves the paper palette, editorial typography, local specificity, radius geometry, and calm voice while reducing the number of ways each common interface job can be expressed.

## Capture first impressions

| Screen | What reads as confident | What reads as unfinished | Evidence |
|---|---|---|---|
| `/beta` | The concentric radius mark, centered editorial headline, and restrained form make the entrance specific and credible. | The primary CTA has no visible hover or active change, its busy label collapses to an ellipsis, and its error says “save” instead of “send.” | 375 by 812 [default](screenshots/beta--mobile-375x812--viewport.png), [hover](screenshots/beta--mobile-375x812--primary-hover.png), [focus](screenshots/beta--mobile-375x812--primary-focus-visible.png), [loading](screenshots/beta--mobile-375x812--primary-loading.png), and [remote error](screenshots/beta--mobile-375x812--email-error.png) |
| `/today` | The alert, daypart sky, Ask entry, and current local item read like a useful daily edition. | The lower mobile fold becomes dense, and the decorative sky layer paints late enough to become LCP in all three production runs. | 375 by 812 [viewport](screenshots/today--mobile-375x812--viewport.png), 768 by 1024 [viewport](screenshots/today--tablet-768x1024--viewport.png), and [Lighthouse runs](probes/lighthouse/summary-run-3.json) |
| `/map` | The centered query dock, county-wide geographic context, marker language, and list alternative form a strong primary surface. | A cream band remains below the map at every viewport, and a populated map continues to say it is loading public places. | 375 by 812 [viewport](screenshots/map--mobile-375x812--viewport.png), 768 by 1024 [viewport](screenshots/map--tablet-768x1024--viewport.png), 1440 by 900 [viewport](screenshots/map--desktop-1440x900--viewport.png), and [layout measurements](probes/layout-measurements.json) |
| `/events` | The almanac masthead, horizon groupings, and feature treatment give the calendar a clear editorial voice. | The 375-pixel ribbon and controls are compressed, and the initial 420-pixel fallback is far shorter than the resolved board, causing a repeatable 0.249 CLS. | 375 by 812 [viewport](screenshots/events--mobile-375x812--viewport.png), [filter panel](screenshots/events--mobile-375x812--what-panel-open.png), and [Lighthouse trace](probes/lighthouse/events.json) |
| `/my-radius` | The empty state is calm, honest, and gives four clear onward actions. Desktop negative space feels deliberate. | Two post-hydration state changes delay the empty-state LCP and move the footer, producing 0.058 CLS in all three runs. | 375 by 812 [viewport](screenshots/saved--mobile-375x812--viewport.png), 1440 by 900 [viewport](screenshots/saved--desktop-1440x900--viewport.png), and [Lighthouse runs](probes/lighthouse/summary-run-3.json) |
| `/search?q=coffee` | The direct-answer position and restrained shell establish the right hierarchy at the top. | The lead does not name an answer, and 47 near-identical raised rows contain neither distance nor open status. | 375 by 812 [viewport](screenshots/search-coffee--mobile-375x812--viewport.png), 1440 by 900 [viewport](screenshots/search-coffee--desktop-1440x900--viewport.png), and [layout measurements](probes/layout-measurements.json) |
| Place detail | The hero image, category stamp, title, status, and field notes are confident on desktop. | Below `lg`, fixed action chrome consumes 142 pixels and duplicates in-flow actions. The gallery fallback also produces image-optimizer errors. | 375 by 812 [viewport](screenshots/place-brewers-alley--mobile-375x812--viewport.png), 768 by 1024 [baseline](screenshots/place-brewers-alley--tablet-768x1024--baseline.png), and [probe](probes/place-brewers-alley--tablet-768x1024.json) |
| Event detail | The event plate, source, specific description, and “What to know” block are distinctive and decision-rich on desktop. | At 768 by 1024, the in-flow actions, fixed action toolbar, and BottomNav are all visible; the fixed toolbar overlaps the in-flow grid by about 8 pixels. | 768 by 1024 [viewport](screenshots/event-alive-at-five--tablet-768x1024--viewport.png) and [layout measurements](probes/layout-measurements.json) |
| `/m/frederick` | The photo, coordinate rule, editorial heading, local quote, and decision badges are the strongest expression of the brand. | The visual system is sound here; the remaining issue is a small contrast failure in the “Cliff notes” label. | 375 by 812 [viewport](screenshots/town-frederick--mobile-375x812--viewport.png) and 1440 by 900 [viewport](screenshots/town-frederick--desktop-1440x900--viewport.png) |

## Scorecard

| Audit area | Score | Justification |
|---|---:|---|
| Layout and spacing | 6/10 | All 27 probes have no document-level horizontal overflow, but Map loses 55 to 127 pixels of usable height, event detail overlaps action layers at 768 by 1024, and Events shifts by 0.249. |
| Typography | 7/10 | Fraunces, Inter, and JetBrains Mono create a clear hierarchy in the captures, but 45 source sizes and frequent 8 to 12.5 pixel tiers weaken consistency. |
| Color | 6/10 | The paper, vermilion, spruce, slate, and gold palette is coherent, but 68 serious contrast instances include primary and public-safety content. |
| Buttons and interactive elements | 6/10 | Primary actions are generally recognizable and focus rings are visible, but custom button systems bypass the canonical component, several touch targets are below 44 pixels, and the beta CTA lacks a complete state contract. |
| Cards and containers | 6/10 | The editorial cards are distinctive and empty states are designed, but 11 shared PlaceCard and EventCard variants plus repeated local recipes create drift, and the place gallery fallback is incompatible with Next Image. |
| Motion | 7/10 | The global reduced-motion pass found no visible CSS offenders on closed pages, but PhotoLightbox still animates for reduced-motion users and motion timing has 56 effective values. |
| Copy and microcopy | 7/10 | The strongest copy is factual and local, but Search assigns homework instead of answering, and the beta email control uses stale labeling and vague error language. |
| Accessibility | 5/10 | Axe found four serious rule families and 181 node instances, while the keyboard and semantic pass found focus-return, skip-target, tab-role, heading, label, and touch-target failures. |
| Perceived performance | 5/10 | TBT is generally low, but the main utility routes show 8.5 to 10.3 second median LCP, Events has 0.249 CLS, and Map ships a large initial collection plus optional code. |
| Distinctiveness | 9/10 | The radius mark, field-guide type, paper texture, map, event plates, and town pages are memorable; Search is the main route that falls back to a generic repeated-card pattern. |

## Findings

### 2.1 Layout and spacing

#### LAY-01: P1, Map reserves space for interface chrome that is not present

- **Severity:** P1 (High).
- **Exact location:** `/map` at 375 by 812, 768 by 1024, and 1440 by 900. Code: `src/app/globals.css:183-202`, `src/app/(app)/map/page.tsx:396-405`, and `src/components/nav/AppMain.tsx:25-34`.
- **Evidence:** The map canvas ends 55 pixels before BottomNav on mobile and tablet. At 1440 by 900 it ends at y=773, leaving 127 pixels of cream below a viewport-locked surface. The CSS subtracts both a stale 48-pixel strip and `--app-bottomnav-reserve: 84px`, even when SideRail replaces BottomNav. See the [mobile capture](screenshots/map--mobile-375x812--viewport.png), [tablet capture](screenshots/map--tablet-768x1024--viewport.png), [desktop capture](screenshots/map--desktop-1440x900--viewport.png), and [DOM measurements](probes/layout-measurements.json).
- **Why it matters:** Map is a primary navigation surface, so unused viewport height directly removes geographic context and makes the layout look incorrectly sized.
- **Exact fix:** Remove the stale 48-pixel subtraction. Set `--app-bottomnav-reserve` to `0px` at `lg`. Remove the paired positive top padding and negative margin, then calculate height from only the visible TopBar, visible mobile navigation, and safe-area insets.

#### LAY-02: P1, detail routes render inline and fixed action systems at the same breakpoint

- **Severity:** P1 (High).
- **Exact location:** `/events/alive-at-five-2026-07-16` and `/places/brewers-alley-frederick` below `lg`. Code: `src/app/(app)/events/[slug]/page.tsx:503-568,828-893`, `src/app/(app)/places/[slug]/page.tsx:375-389,565-599`, `src/components/ui/MobileActionBar.tsx:27-66`, and `src/components/nav/AppMain.tsx:25-34`.
- **Evidence:** At 768 by 1024, the event in-flow action grid runs from y=816.9 to 884.9 while the fixed toolbar begins at y=877, creating about 8 pixels of overlap. BottomNav then occupies y=952 to 1014. At 375 by 812, the place and event toolbar plus BottomNav occupy 142 and 147 pixels, or 17.5 and 18.1 percent of the viewport. See the [event tablet capture](screenshots/event-alive-at-five--tablet-768x1024--viewport.png), [place mobile capture](screenshots/place-brewers-alley--mobile-375x812--viewport.png), and [measurements](probes/layout-measurements.json).
- **Why it matters:** Repeated actions obscure content, weaken the primary-action hierarchy, and make the tablet layout look accidentally layered.
- **Exact fix:** Render the in-flow grids only at `lg` and above with `hidden lg:grid`. Keep MobileActionBar only below `lg`. Add one shared bottom-clearance token equal to the full fixed action stack and use it in AppMain and detail routes.

#### LAY-03: P1, the Events fallback and resolved board have incompatible heights

- **Severity:** P1 (High).
- **Exact location:** `/events` at 375 by 812. Code: `src/app/(app)/events/(list)/page.tsx:186-224,334-368` and `src/components/event/EventsExplorer.tsx:101-145`.
- **Evidence:** Production Lighthouse reproduced CLS values of `0.2490`, `0.2490`, and `0.2490`. The single largest shift is the Events honesty footer at `0.24556`, which is 98.6 percent of the total. A roughly 420-pixel page fallback is replaced by a resolved board around 4,300 pixels tall, so the footer first appears near the viewport and then moves far down the document. See [run 1](probes/lighthouse/summary-run-1.json), [run 2](probes/lighthouse/summary-run-2.json), [run 3](probes/lighthouse/summary-run-3.json), and the [route trace](probes/lighthouse/events.json).
- **Why it matters:** A 0.249 CLS is a visible page jump on a high-traffic route and is well above the 0.1 “good” threshold.
- **Exact fix:** Server-render the default first horizon, keep a stable minimum height of at least one viewport for the board, and move the honesty footer into the resolved boundary. Keep URL synchronization in a small client controller instead of making the entire visible board depend on `useSearchParams`.

#### LAY-04: P2, spacing uses 73 values instead of one documented 4-pixel scale

- **Severity:** P2 (Medium).
- **Exact location:** App-wide. Representative locations: `src/components/place/PlaceCard.tsx:82`, `src/components/place/FieldNoteTag.tsx:26,58`, `src/components/today/MastheadTitle.tsx:63`, `src/components/ui/GlanceLedger.tsx:154`, `src/components/answer/AnswerCard.tsx:59`, and `src/components/event/EventCard.tsx:365`.
- **Evidence:** The static inventory found 54 fixed spacing values and 19 fluid or safe-area forms. Twenty-seven fixed values do not land on a 4-pixel multiple. Examples include 3, 3.5, 11, 14, 19, and 26 pixels. The exhaustive source candidates are in [token-source-evidence.json](probes/token-source-evidence.json).
- **Why it matters:** Frequent one-off values make shared alignment and responsive clearance harder to reason about, which contributed to the Map and detail-action defects.
- **Exact fix:** Adopt `0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 80, 96px`. Round ordinary layout values to the nearest step. Preserve hairlines, documented optical nudges, safe-area formulas, and map geometry as named exceptions.

### 2.2 Typography

#### TYPE-01: P2, the rendered hierarchy uses too many near-identical sizes

- **Severity:** P2 (Medium).
- **Exact location:** App-wide, especially `/today` and `/events`. Code: `src/app/globals.css:1391-1407,1465-1484`, `src/app/(app)/today/page.tsx:660-667`, `src/components/event/EventCard.tsx:114-584`, and `src/app/globals.css:3610-3747`.
- **Evidence:** Source uses 45 distinct size values: 38 fixed sizes from 8 through 60 pixels and seven fluid formulas. The 27 runtime probes rendered 37 computed font sizes. Today renders 20 sizes at 375 by 812, including 9, 9.5, 10.5, 11.5, 12.5, 13.5, and 15.5 pixels. See the [Today mobile capture](screenshots/today--mobile-375x812--viewport.png), [Events mobile capture](screenshots/events--mobile-375x812--viewport.png), and [Today computed styles](probes/today--mobile-375x812.json).
- **Why it matters:** Tiny half-step tiers add noise without creating a stronger hierarchy, and small text makes existing contrast misses more consequential.
- **Exact fix:** Finish adoption of the scale already defined in `globals.css`: 10 caption, 11 meta, 12 meta-large, 13 body, 14 body-large, 15 title-small, 16 lead, 18 title, then three fluid display tiers. Reserve 8 to 9 pixels for documented cartographic micro-labels only. Add a lint check against new arbitrary `text-[Npx]` values outside exceptions.

#### TYPE-02: P1, priority routes have incomplete heading structure

- **Severity:** P1 (High).
- **Exact location:** `/events` and `/places/brewers-alley-frederick`. Code: `src/components/event/EventsBoardDock.tsx:390-396`, `src/app/(app)/events/(list)/page.tsx:168-198`, `src/components/place/FieldNotesCard.tsx:69-78`, and `src/app/(app)/places/[slug]/page.tsx:249,327-336`.
- **Evidence:** Every `/events` probe has no `h1`; the first heading is `h2` “What’s on,” and that masthead can be `aria-hidden`. Place detail moves from its `h1` directly to `h3` “Field notes” before later `h2` sections. See [events mobile probe](probes/events--mobile-375x812.json) and [place mobile probe](probes/place-brewers-alley--mobile-375x812.json).
- **Why it matters:** Screen-reader heading navigation lacks a stable page title on Events and skips a level on Place.
- **Exact fix:** Add one persistent `h1` such as “Events in Frederick County,” visually hidden if the visible masthead should stay unchanged. Make “Field notes” an `h2`.

Typography strengths to preserve: page and section hierarchy is visually clear in [Today desktop](screenshots/today--desktop-1440x900--baseline.png) and [Town desktop](screenshots/town-frederick--desktop-1440x900--baseline.png). Body columns generally stay within a readable measure. Legal footer copy is the main intentional exception. Sentence case is consistent for actions and headings; uppercase mono is reserved for field-guide metadata. Next font loading uses variable files, Latin subsets, and `display: swap`.

### 2.3 Color

#### COLOR-01: P0, primary actions and public-safety content fail WCAG AA contrast

- **Severity:** P0 (Blocker) under this review's definition because primary and public-safety content fails contrast.
- **Exact location:** `/beta`, `/places/brewers-alley-frederick`, and the civic alert on `/today`, all three viewports. Code: `src/components/beta/BetaEmailField.tsx:79-90`, `src/components/place/MyRadiusButton.tsx:143-164`, and `src/components/today/CivicAlerts.tsx:100-105,142-193`.
- **Evidence:** Axe measured the beta CTA at 4.03:1 (`#fcfbf8` on `#e14328`, 13px), the place Save CTA at 4.17:1 (white on `#e14328`, 12px), the warning title at 4.20:1, the NWS chip at 2.94:1, the alert time at 3.71:1, and the scope chip at 2.95:1. See [beta mobile](screenshots/beta--mobile-375x812--viewport.png), [place mobile](screenshots/place-brewers-alley--mobile-375x812--viewport.png), [Today mobile](screenshots/today--mobile-375x812--viewport.png), and the matching route probes.
- **Why it matters:** These controls gate access, save intent, and communicate a safety alert, so unreliable legibility blocks primary content.
- **Exact fix:** Use `--app-brand-press` with `--app-on-brand` for filled brand controls. Use `--app-warning-press` with an AA foreground for the alert panel. Replace translucent white alert chips with explicit opaque foreground and background pairs. Add a token-level contrast matrix and test every semantic pair at normal-text size.

#### COLOR-02: P1, ten additional text roles fail WCAG AA

- **Severity:** P1 (High).
- **Exact location:** `/today`, `/map`, event detail, and `/m/frederick`. Source locations are listed below.
- **Evidence:** Axe reported the following exact failures. The selectors and all 68 contrast node instances are retained in the 27 route probes.

| Route and element | Ratio and rendered pair | Source | Exact fix |
|---|---|---|---|
| `/today` Family category tabs, two nodes per viewport | 4.25:1, white on `#a1721c`, 10px bold | `src/components/event/EventCard.tsx:362-370` | Use a tested category foreground and surface pair instead of an 82 percent mix. |
| `/today` Tuesday tile, tablet only | 4.24:1, `#5c5a50` on `#d7c9b0`, 9px | `src/components/event/EventCard.tsx:387-395` | Use `--app-ink-2` or increase the size and weight. |
| `/today` Deals link | 3.23:1, `#e14328` on `#ebe2cd`, 12px | `src/components/today/TodaysDealsStack.tsx:74-80` | Use `--app-brand-press`, which measures 4.80:1 on app background. |
| `/today` parking-plan link | 3.70:1, `#e14328` on `#f7f1e5`, 13px | `src/components/today/TonightParkingPlan.tsx:52-63` | Use `--app-brand-press`, which measures 5.55:1 on the elevated surface. |
| `/map` live-bus badge, mobile only | 4.20:1, white on `#f4152b`, 11px bold | `src/components/map/LiveBuses.tsx:149-159,437-454` | Choose the pair by measured contrast and darken the badge fill while retaining the route hue in the ring. |
| Event recurrence months, ten nodes per viewport | 4.25:1, `#b5300f` on `#e1d5bd`, 10px bold | `src/app/(app)/events/[slug]/page.tsx:710-717` | Use `--app-ink-2` or add a darker brand-on-sunken role. |
| Event “See all” | 3.23:1, brand on app background, 12px | `src/app/(app)/events/[slug]/page.tsx:776-782` | Use `--app-brand-press`. |
| Town “Cliff notes” | 3.70:1, brand on elevated surface, 10px | `src/components/municipality/TownAlmanac.tsx:71-74` | Use `--app-brand-press`. |

- **Why it matters:** Small metadata and action links become unreliable for low-vision users even when the surrounding visual hierarchy is clear.
- **Exact fix:** Apply the mappings in the table, then rerun axe across all 27 route and viewport combinations.

#### COLOR-03: P2, raw colors bypass semantic ownership and one missing token invalidates a shadow

- **Severity:** P2 (Medium).
- **Exact location:** App-wide. Concentrations: `src/components/map/AppMap.tsx:1751-1847,1932-2481,2602-2614`, `src/components/saved/SavedWallet.tsx:88-105`, `src/components/event/EventCard.tsx:390,577`, `src/components/place/PlaceCard.tsx:174`, and `src/components/map/TimeScrubber.tsx:140`.
- **Evidence:** The inventory found 60 named roles, including 14 tint utilities, but also 315 distinct raw primitives or expressions. Three hundred and three occur outside token definitions, for 932 occurrences in 111 files. Mapbox paint accounts for 82 raw literals, and Saved Wallet owns 36 category colors. `PlaceCard` references undefined `--app-ink-tint-8` without a fallback, which invalidates the whole inset-shadow declaration. `TimeScrubber` references undefined `--app-brand-tint-2`, but has a fallback. See [token-source-evidence.json](probes/token-source-evidence.json).
- **Why it matters:** Palette changes and contrast corrections cannot be made reliably when equivalent roles have many literal owners, and undefined custom properties silently drop complete declarations.
- **Exact fix:** Keep current brand values. Route ordinary UI colors to semantic roles. Centralize Mapbox paint in one typed TypeScript palette because Mapbox cannot consume CSS variables. Centralize Saved Wallet category colors in one typed owner. Replace or define the two missing tints, and add a build check for undefined project custom properties.

At 375 by 812, the probes recorded these unique computed foreground and background color values as a conservative hue-complexity proxy: Beta 14 and 14; Today 37 and 47; Map 7 and 26; Events 17 and 20; Saved 7 and 6; Search 7 and 11; Place 15 and 21; Event detail 14 and 16; Town 17 and 19. Today's higher count is largely semantic weather, alert, event-category, and state color. Do not flatten those roles, but ensure action vermilion remains distinct from decorative and category color.

### 2.4 Buttons and interactive elements

#### INT-01: P1, the 44-pixel target policy is not consistently implemented

- **Severity:** P1 (High).
- **Exact location:** Confirmed misses include Mapbox zoom controls and attribution (`src/components/map/AppMap.tsx:1653,2783`; `src/app/globals.css:522-535`), Map search input (`src/components/map/MapDock.tsx:820-830`; `src/app/globals.css:2802-2819`), Events view buttons (`src/components/event/EventsBoardDock.tsx:493-507`; `src/app/globals.css:3755-3775`), event Share (`src/components/event/EventActions.tsx:21,126-140`), “Show N more” (`src/components/event/EventsExplorer.tsx:701-721`), footer links (`src/components/nav/AppFooter.tsx:39-55`), place Share (`src/components/place/ShareButton.tsx:90-112`), and the beta code link (`src/app/beta/page.tsx:300-302`).
- **Evidence:** Confirmed examples measure 32 by 32 for Mapbox zoom, 24 by 24 for attribution, 34 by 30 with only 33 to 34 pixels of effective width for Events view buttons, 36 by 36 for event Share, 41.5 pixels high for “Show N more,” and 16 to 32 pixels high for several text links. Axe also found 14 target-size instances on Map after overlap geometry was considered. See [layout measurements](probes/layout-measurements.json) and the map route probes.
- **Why it matters:** Small targets increase touch error rates and violate the explicit 44 by 44 product standard even when some pass WCAG's smaller exception-based minimum.
- **Exact fix:** Make icon actions and view controls 44 by 44. Stretch the map input itself to fill its 46-pixel row. Give reveal and footer actions `min-height: 44px`. Correct the Mapbox selector from `.maplibregl-*` to the runtime `.mapboxgl-*` classes.

#### INT-02: P2, the beta CTA does not expose six distinct states

- **Severity:** P2 (Medium).
- **Exact location:** `/beta`; `src/components/beta/BetaEmailField.tsx:79-95`.
- **Evidence:** Default and hover use the same computed treatment, active has no specific treatment, focus-visible has a clear two-pixel ring, and loading disables the control, lowers opacity, and changes “Email me a code” to a 40-pixel ellipsis button. See the [default](screenshots/beta--mobile-375x812--viewport.png), [hover](screenshots/beta--mobile-375x812--primary-hover.png), [focus](screenshots/beta--mobile-375x812--primary-focus-visible.png), and [loading](screenshots/beta--mobile-375x812--primary-loading.png) captures.
- **Why it matters:** The primary acquisition control gives weak pointer feedback and its busy state shifts width while hiding the outcome.
- **Exact fix:** Reuse the canonical primary Button state recipe. Add a visible hover lift or tone change, a pressed treatment, `aria-busy`, a spinner, and stable-width “Sending code…” text. Keep focus-visible and disabled visually distinct.

#### INT-03: P2, the event Save label is outside its clickable control

- **Severity:** P2 (Medium).
- **Exact location:** Event MobileActionBar; `src/components/ui/MobileActionBar.tsx:124-140`.
- **Evidence:** `MobileBarControl` renders the client control as one child and a separate visible `<span>` label below it. The event detail mobile capture shows “Save” as part of the action cell, but a hit test on the label center does not land on the Save button. See the [event mobile capture](screenshots/event-alive-at-five--mobile-375x812--viewport.png).
- **Why it matters:** The visible label implies that the whole cell is actionable, but part of that apparent target does nothing.
- **Exact fix:** Make the entire cell one button or link, and render the icon and label inside it. Do not nest interactive elements.

#### INT-04: P2, shared and route-specific button systems have overlapping jobs

- **Severity:** P2 (Medium).
- **Exact location:** Canonical Button at `src/components/ui/Button.tsx:15-45`; custom systems in `BetaEmailField`, `TopBar`, `BottomNav`, `SideRail`, `MobileActionBar`, `MapDock`, `EventsBoardDock`, place/event inline action grids, and card actions.
- **Evidence:** The canonical component exposes three variants and three sizes, but priority screens also implement independent primary, secondary, quiet, icon, segmented, nav, toolbar-cell, and full-card actions. The canonical small and medium sizes are 32 and 40 pixels high (`Button.tsx:18-21`), which conflicts with the 44-pixel touch standard. See [Today mobile](screenshots/today--mobile-375x812--viewport.png), [Events mobile](screenshots/events--mobile-375x812--viewport.png), and [place mobile](screenshots/place-brewers-alley--mobile-375x812--viewport.png).
- **Why it matters:** Equivalent actions acquire different state, size, contrast, and motion behavior depending on their route.
- **Exact fix:** Keep three semantic Button variants and add explicit icon, segmented, nav, and toolbar primitives that all consume one state and size contract. Make all touch-context sizes at least 44 pixels. Migrate route-specific controls by role, not by visual similarity alone.

Button family inventory:

| Family | Variants or roles | Main locations |
|---|---|---|
| Canonical Button | primary, secondary, quiet; small, medium, large | `src/components/ui/Button.tsx`; AnswerCard, PrimaryActionCard, CommerceActions, place detail, not-found, and styleguide callers |
| Global navigation | TopBar pills and icons, BottomNav tabs, SideRail tabs | `src/components/nav/TopBar.tsx`, `BottomNav.tsx`, `SideRail.tsx` |
| Detail actions | inline action grid, MobileActionBar links, MobileBarControl | event and place detail routes; `src/components/ui/MobileActionBar.tsx` |
| Board controls | Map dock filters, Events dock filters, segmented view buttons | `src/components/map/MapDock.tsx`, `src/components/event/EventsBoardDock.tsx` |
| Form actions | beta email submit, beta access submit, search clear and submit | `src/components/beta/BetaEmailField.tsx`, `src/app/beta/page.tsx`, search components |
| Card controls | full-card links, Save, Share, source and disclosure controls | PlaceCard, EventCard, Search results, saved cards |

### 2.5 Cards and containers

#### CARD-01: P1, the place gallery fallback response is incompatible with Next Image

- **Severity:** P1 (High).
- **Exact location:** `/places/brewers-alley-frederick`; `src/app/api/place-photo/route.ts:80-145,181-215`, `src/components/place/PlacePhotoGallery.tsx:17-56`, and `src/app/(app)/places/[slug]/page.tsx:453`.
- **Evidence:** The place route probe records three to six browser image errors. Server logs show the Next image optimizer rejecting the proxy response because the endpoint returns `image/svg+xml` while `dangerouslyAllowSVG` is disabled. The API intentionally returns a 200 SVG placeholder for missing keys, upstream errors, and fetch failures, while PlacePhotoGallery passes the URL directly to Next Image and has no `onError`. See [place mobile probe](probes/place-brewers-alley--mobile-375x812.json) and the [place baseline](screenshots/place-brewers-alley--mobile-375x812--baseline.png).
- **Why it matters:** A designed fallback becomes a broken optimized-image request on a core detail page, which creates console noise, wasted requests, and unreliable gallery presentation.
- **Exact fix:** Return a compatible raster placeholder from the API or route all proxy photos through one client `PlacePhoto` component with `onError` and an explicit raster fallback. Do not enable arbitrary SVG optimization globally.

#### CARD-02: P2, shared cards expose 11 variants and Search repeats a high-elevation recipe 47 times

- **Severity:** P2 (Medium).
- **Exact location:** `src/components/place/PlaceCard.tsx:191-220`, `src/components/event/EventCard.tsx:27-76`, and `src/app/(app)/search/page.tsx:200-268`.
- **Evidence:** PlaceCard exposes row, feature, tile, grid, and answer. EventCard exposes utility, compact, glance, row, tile, and feature. Search renders 47 rows; the mobile document is about 3,619 pixels tall, and its probe finds 48 instances of the same tactile shadow treatment. See [search mobile](screenshots/search-coffee--mobile-375x812--viewport.png), [events compact](screenshots/events--mobile-375x812--compact-view.png), and [Town mobile](screenshots/town-frederick--mobile-375x812--viewport.png).
- **Why it matters:** Variant sprawl makes hierarchy and spacing changes expensive, while repeated elevation makes every search result compete with the one direct answer.
- **Exact fix:** Consolidate common cards into an editorial feature, a decision answer, and a dense row. Preserve Saved Wallet, Explore Deck, Map Peek, and other documented brand-specific exceptions. Use one RowList surface with dividers for secondary Search results and reserve tactile elevation for the direct answer.

The application does provide designed empty and loading states for the captured flows. Saved is especially strong in [its mobile empty state](screenshots/saved--mobile-375x812--viewport.png), and Search gives a clear recovery instruction in [its no-result state](screenshots/search-no-results--mobile-375x812--empty.png). Map's list alternative is usable in [map list-open](screenshots/map--mobile-375x812--list-open.png). The main missing-state defect is the photo fallback in CARD-01 rather than a blank container.

### 2.6 Motion

#### MOTION-01: P1, PhotoLightbox animates under reduced motion

- **Severity:** P1 (High).
- **Exact location:** Place gallery lightbox; `src/components/ui/PhotoLightbox.tsx:1-23,79-101`.
- **Evidence:** In a controlled Playwright spot-check at 375 by 812 with `prefers-reduced-motion: reduce`, the preference matched, but the opened lightbox still ran a 180ms image opacity and scale transition plus a 300ms backdrop transition. Frame samples progressed from image opacity 0 and scale 0.985 to opacity 1 and scale 1 over roughly 222ms; the backdrop reached opacity 1 at about 339ms. The static closed-page reduced-motion probe correctly found no CSS offenders, so this is a runtime component exception rather than a global CSS failure. The gallery trigger is visible in the [place mobile baseline](screenshots/place-brewers-alley--mobile-375x812--baseline.png).
- **Why it matters:** Users who request reduced motion still receive spatial scale and fade motion in a full-screen overlay.
- **Exact fix:** Use Framer Motion's reduced-motion hook. Under reduce, set immediate opacity, remove scale, and give the backdrop a zero-duration transition. Add an automated test that opens and closes the lightbox under reduced motion.

#### MOTION-02: P2, interaction timing has 56 effective values despite three duration tokens

- **Severity:** P2 (Medium).
- **Exact location:** App-wide. Representative sources: `src/components/ui/Button.tsx:38`, `src/components/nav/BottomNav.tsx:117`, `src/components/nav/SideRail.tsx:102`, `src/components/map/AppMap.tsx:543-546,1096-1101,1395-1415,2839-2846`, and `src/components/radius/RadiusMap.tsx:335-359`.
- **Evidence:** The token layer defines 160, 240, and 420ms plus three easing roles (`src/app/globals.css:204-207,282,756`). Runtime source still uses 56 effective duration values and 10 easing spellings, including 120, 150, 180, 200, 220, 250, 280, 300, 320, 340, 350, 380, 400, 480, 500, 520, 540, 600, 700, 900, and 1,100ms. See [token-source-evidence.json](probes/token-source-evidence.json).
- **Why it matters:** Similar controls feel unrelated, and reduced-motion compliance must be checked in many local implementations.
- **Exact fix:** Map micro feedback to 160ms, control and small state changes to 240ms, and spatial entrances to 420ms. Keep one named 900ms map-camera exception. Name ambient cycles by component and stop them under reduced motion.

### 2.7 Copy and microcopy

#### COPY-01: P1, Search claims a nearest open answer without presenting one

- **Severity:** P1 (High).
- **Exact location:** `/search?q=coffee`; `src/lib/search/answer.ts:60-79` and `src/app/(app)/search/page.tsx:47-80,105-152,200-268`.
- **Evidence:** The direct-answer lead says “The nearest one open, near you” but names no place, distance, opening time, location-permission state, source, or freshness. The 47 result rows also include no open status and no distance. See [search mobile](screenshots/search-coffee--mobile-375x812--viewport.png), [search desktop](screenshots/search-coffee--desktop-1440x900--viewport.png), and [layout measurements](probes/layout-measurements.json).
- **Why it matters:** The product's North Star says the interface should answer in one move, but this flow requires another tap and gives no evidence for choosing among 47 results.
- **Exact fix:** When location is available, name the actual nearest open place and show distance, open-until time, source, and freshness. When location is unavailable, say “Turn on location to find the nearest open coffee” instead of claiming “near you.” Render secondary results as a ledger with decision metadata and progressive disclosure.

#### COPY-02: P2, beta labeling and status copy describe the wrong outcome

- **Severity:** P2 (Medium).
- **Exact location:** `/beta`; `src/components/beta/BetaEmailField.tsx:55-95`.
- **Evidence:** The visible action sends an access code, but the input announces “Email for launch news.” Busy state says only “…” and the remote error says “Couldn’t save that right now.” See [beta loading](screenshots/beta--mobile-375x812--primary-loading.png) and [beta remote error](screenshots/beta--mobile-375x812--email-error.png).
- **Why it matters:** The label, action, and result do not use one term for the same flow, so assistive-technology users and sighted users receive different descriptions.
- **Exact fix:** Use a tied label “Email address for an access code.” Keep the button “Email me a code.” Use “Sending code…” while busy and “We could not send a code right now. Try again in a minute.” on failure.

#### COPY-03: P3, the no-result punctuation treats the period as part of the query

- **Severity:** P3 (Refinement).
- **Exact location:** `/search?q=zzzz-audit-no-result`; Search no-result rendering in `src/app/(app)/search/page.tsx`.
- **Evidence:** The visible message reads `No results for “zzzz-audit-no-result.”` so the period appears inside the quoted query. See the [no-result capture](screenshots/search-no-results--mobile-375x812--empty.png).
- **Why it matters:** The recovery message otherwise works, but the punctuation makes the literal query look inaccurate.
- **Exact fix:** Render `No results for “{query}”. Try a category, town, or shorter phrase.`

Copy decision required: `docs/VOICE.md:74-87` bans “live,” while factual interface labels such as “Live music” and “Live now” use the word accurately. Decide whether the guide should allow factual live-state labels or whether those labels should become “Music now” and “Happening now.” This review does not assume either choice.

### 2.8 Accessibility

The axe baseline covered nine routes at three viewports. It found four serious rule families and 181 node instances: 68 `color-contrast`, 96 `nested-interactive`, 14 `target-size`, and 3 `aria-prohibited-attr`. `/events`, `/my-radius`, and `/search?q=coffee` had no axe violations, but manual findings still apply. Every route had one `<main>` and no document-level horizontal overflow.

#### A11Y-01: P1, Map markers have invalid nested semantics and collision geometry

- **Severity:** P1 (High).
- **Exact location:** `/map` at all three viewports; event markers `src/components/map/AppMap.tsx:2627-2690`, live buses `src/components/map/LiveBuses.tsx:370-456`, and list alternative `src/components/map/MapList.tsx:66`.
- **Evidence:** Axe reports 32 `nested-interactive` nodes per capture, 96 total. Mapbox adds `role="img" aria-label="Map marker"` to wrappers that contain focusable buttons. Some off-canvas wrappers remain in DOM tab order. Four overlapping event buttons at every viewport have safe click regions as small as 7 by 36, 4 to 5 by 29, 44 by 4, and 44 by 18 pixels. Tablet also includes one bus target and attribution collision. Exact selector families are `.mapboxgl-marker[aria-label="Map marker"]:nth-child(2…33)` for nesting and event `nth-child(2,5,13,18)`, bus `nth-child(20)`, and `.mapbox-improve-map` for targets. See [map mobile probe](probes/map--mobile-375x812.json), [tablet probe](probes/map--tablet-768x1024.json), and [desktop probe](probes/map--desktop-1440x900.json).
- **Why it matters:** Wrapper image semantics suppress or confuse the button's purpose, keyboard users can traverse invisible pins, and overlapping pins defeat otherwise nominal 44-pixel targets.
- **Exact fix:** Introduce one AccessibleMarker wrapper. Remove Mapbox's default wrapper role and label, make off-viewport pins untabbable, expose one roving visible marker to Tab with arrow-key navigation, and cluster or declutter colliding markers into one 44-pixel cluster button. Preserve the accessible List alternative.

#### A11Y-02: P1, the skip link focuses a wrapper before repeated navigation

- **Severity:** P1 (High).
- **Exact location:** Global shell; `src/app/layout.tsx:252-270`, `src/app/(app)/layout.tsx:49-59`, and `src/components/nav/AppMain.tsx:25-41`.
- **Evidence:** Tab correctly reveals “Skip to content,” and Enter moves focus to `#main`. That ID is on a wrapper around the entire child tree, so its accessible text begins with Frederick Radius, Search, and Browse before the real `<main>`. The next Tab can return to header controls. See [skip-link focus](screenshots/today--mobile-375x812--skip-link-focus.png) and [interactive-states.json](probes/interactive-states.json).
- **Why it matters:** Keyboard users do not actually bypass the repeated site header.
- **Exact fix:** Move `id="main" tabIndex={-1}` onto AppMain's real `<main>`. Give beta and other non-app layouts their own real content targets.

#### A11Y-03: P1, “Claim coming soon” uses prohibited ARIA on static text

- **Severity:** P1 (High).
- **Exact location:** Place detail; `src/components/business/ClaimComingSoon.tsx:22-46`.
- **Evidence:** Axe reports one `aria-prohibited-attr` node at every viewport. A plain `<span>` receives `aria-disabled` and `aria-label`, while visible children are hidden. Selector: `.gap-3.text-xs.flex-wrap > .gap-1\.5.inline-flex.items-center`. See [place probes](probes/place-brewers-alley--mobile-375x812.json).
- **Why it matters:** The element has no role that supports those attributes, so its announcement is unreliable.
- **Exact fix:** Remove `aria-disabled`, `aria-label`, and child `aria-hidden`, then expose the complete sentence as ordinary text. If it should be an unavailable action, use a native disabled button.

#### A11Y-04: P1, Browse traps focus but loses it on close and has no explicit close button

- **Severity:** P1 (High).
- **Exact location:** Global Browse drawer; `src/components/nav/TopBar.tsx:272-289`, `src/components/nav/MoreSheet.tsx:150-156`, and `src/components/ui/BottomDrawer.tsx:57-115`.
- **Evidence:** The keyboard probe confirms that focus wraps from the last drawer link to the first control. Escape closes the drawer, but focus then lands on `<body>` instead of Browse. The controlled drawer does not receive a Vaul trigger reference and presents no labeled Close control. See [Browse open](screenshots/today--mobile-375x812--browse-drawer-open.png) and [interactive-states.json](probes/interactive-states.json). The Search dialog is the positive comparison: it traps and returns focus correctly.
- **Why it matters:** Keyboard and switch users lose their location, while touch users must infer swipe or backdrop dismissal.
- **Exact fix:** Pass the Browse button through `Drawer.Trigger asChild` or retain its ref and restore it whenever controlled state closes. Add a labeled 44 by 44 `Drawer.Close` button in the header.

#### A11Y-05: P1, Map and Events filters claim tab behavior without implementing it

- **Severity:** P1 (High).
- **Exact location:** `src/components/event/EventsBoardDock.tsx:430-470,518-530` and `src/components/map/MapDock.tsx:457-510,868-921`.
- **Evidence:** Both docks use `tablist` and `tab`, but every tab stays in sequential Tab order, all Events tabs point to the same `#eb-pane`, and neither implementation supports Arrow, Home, End, or roving tabindex. Opening a filter traps focus like a dialog. See [Events filter open](screenshots/events--mobile-375x812--what-panel-open.png) and [Map default](screenshots/map--mobile-375x812--viewport.png).
- **Why it matters:** Assistive-technology users receive a tab interaction promise that does not match the disclosure and modal-like behavior.
- **Exact fix:** Match current behavior with normal buttons using `aria-expanded`, `aria-controls`, and `aria-haspopup="dialog"`. Give each open sheet a name, focus trap, Escape close, and focus return. Only retain tabs if each has a unique panel and full keyboard behavior.

#### A11Y-06: P1, search and beta fields lack durable, matched labels

- **Severity:** P1 (High).
- **Exact location:** Search `src/components/search/SearchInput.tsx:28-40`; beta `src/components/beta/BetaEmailField.tsx:63-71`.
- **Evidence:** Search relies only on its placeholder, which disappears during input. Beta's accessible label says “Email for launch news” while the flow sends an access code. See [search input](screenshots/search-coffee--mobile-375x812--viewport.png) and [beta input](screenshots/beta--mobile-375x812--viewport.png).
- **Why it matters:** Users need a durable field name, and the current beta label announces a different outcome.
- **Exact fix:** Add a visible or screen-reader label tied to Search: “Search places, events, and towns.” Apply the beta label proposed in COPY-02.

#### A11Y-07: P3, the place hero alt duplicates its adjacent heading

- **Severity:** P3 (Refinement).
- **Exact location:** `src/components/place/PlaceHero.tsx:47-61,121-130`.
- **Evidence:** The hero image alt is exactly “Brewer’s Alley,” which immediately repeats the visible `h1`. See [place desktop baseline](screenshots/place-brewers-alley--desktop-1440x900--baseline.png) and [place probe](probes/place-brewers-alley--desktop-1440x900.json).
- **Why it matters:** The alt adds no image information and creates repeated identity text.
- **Exact fix:** Use a real photo description when one is curated. Otherwise use empty alt because the adjacent heading already identifies the place.

Axe violation inventory:

| Rule | Impact | Routes and exact selector scope | Node instances |
|---|---|---|---:|
| `color-contrast` | serious | The selectors and ratios in COLOR-01 and COLOR-02 across Beta, Today, Map, Place, Event detail, and Town | 68 |
| `nested-interactive` | serious | `/map`: `.mapboxgl-marker[aria-label="Map marker"]:nth-child(2…33)` at each viewport | 96 |
| `target-size` | serious | `/map`: event marker `nth-child(2,5,13,18)` at each viewport; bus `nth-child(20)` and `.mapbox-improve-map` at tablet | 14 |
| `aria-prohibited-attr` | serious | Place detail: `.gap-3.text-xs.flex-wrap > .gap-1\.5.inline-flex.items-center` at each viewport | 3 |

Accessibility strengths to preserve: the global focus-visible ring is defined at `src/app/globals.css:380-383`; Search is a named modal with Escape, containment, and focus return (`src/components/search/SearchOverlay.tsx:199-253,315-368`); beta error uses `role="alert"` and success uses `role="status"`; decorative and card images generally use empty alt appropriately; all priority routes contain one main landmark.

### 2.9 Perceived performance

#### Performance baseline

These are local production-build Lighthouse navigation runs with simulated mobile throttling at 375 by 812. They are lab measurements, not field data. Navigation mode returned no INP on any route. TBT is shown only as a lab responsiveness proxy and must not be labeled INP.

| Route | Performance score | LCP | CLS | TBT proxy |
|---|---:|---:|---:|---:|
| `/today` | 70 / 75 / 75 | 5.97 / 8.72 / 8.49s | 0.0087 / 0.0086 / 0.0086 | 67 / 61 / 42ms |
| `/map`, WebGL-enabled reruns | 63 / 63 | 9.63 / 9.62s | 0.0025 / 0.0026 | 248 / 249ms |
| `/events` | 62 / 62 / 61 | 9.92 / 10.30 / 11.04s | 0.249 / 0.249 / 0.249 | 68 / 68 / 92ms |
| `/my-radius` | 74 / 74 / 74 | 9.93 / 9.77 / 9.77s | 0.0583 / 0.0583 / 0.0582 | 28 / 21 / 27ms |
| `/search?q=coffee` | 84 / 84 / 84 | 4.51 / 4.51 / 4.51s | 0 / 0 / 0 | 22 / 24 / 24ms |
| Place detail | 80 / 81 / 79 | 5.41 / 5.03 / 5.56s | 0.0017 / 0.0017 / 0.0017 | 10 / 12 / 16ms |
| Event detail | 83 / 85 / 83 | 4.66 / 4.36 / 4.73s | 0.0035 / 0.0035 / 0.0034 | 23 / 23 / 26ms |
| Town | 75 / 82 / 82 | 9.47 / 4.88 / 4.96s | 0.0017 / 0.0017 / 0.0017 | 46 / 22 / 24ms |

Evidence: [run 1](probes/lighthouse/summary-run-1.json), [run 2](probes/lighthouse/summary-run-2.json), [run 3](probes/lighthouse/summary-run-3.json), [Map WebGL run 1](probes/lighthouse/map-webgl-run-1.json), and [Map WebGL run 2](probes/lighthouse/map-webgl-run-2.json).

#### PERF-01: P1, Events ships a late lazy LCP image and a large client-rendered board

- **Severity:** P1 (High).
- **Exact location:** `/events`; `src/app/(app)/events/(list)/page.tsx:257-260,317,334-368`, `src/components/event/EventsExplorer.tsx:620-682`, and `src/components/event/EventCard.tsx:258-293`.
- **Evidence:** LCP is 9.92, 10.30, and 11.04 seconds. The LCP element is a 348 by 232 event feature image at y=692 to 924. It is lazy-loaded, absent from the initial document, and lacks high fetch priority; load delay is 86 to 91 percent of LCP. The full event collection is serialized into the client component, and one run's document resource is 1.19MB uncompressed. See the [Events mobile capture](screenshots/events--mobile-375x812--viewport.png) and [route Lighthouse JSON](probes/lighthouse/events.json).
- **Why it matters:** The first editorial image appears roughly ten seconds into a core discovery flow even though main-thread blocking is low.
- **Exact fix:** Server-render the default first horizon. Give priority to the first rendered photo lead, not merely `groupIdx === 0`. Ship the first horizon and facet counts initially, then fetch later horizons or filtered pages on demand. This work should also implement LAY-03's stable fallback.

#### PERF-02: P1, Today's decorative sky texture becomes the LCP element

- **Severity:** P1 (High).
- **Exact location:** `/today`; `src/app/(app)/today/page.tsx:220-236`, `src/components/today/SkyHero.tsx:162-200,223-249`, `src/app/globals.css:691-699`, and `src/lib/integrations/nws.ts:64-86`.
- **Evidence:** All three runs identify the `aria-hidden` `.sky-grain` layer as LCP. LCP is 5.97, 8.72, and 8.49 seconds while TBT stays between 42 and 67ms. Load delay and render delay account for most of the metric. `SkyHero` waits for sequential forecast retrieval before returning its structural DOM, and the texture is a URL-backed SVG turbulence image. See [Today mobile](screenshots/today--mobile-375x812--viewport.png) and the [Today Lighthouse JSON](probes/lighthouse/today.json).
- **Why it matters:** Decorative texture becomes the page's performance milestone and withholds a major visual frame despite little main-thread contention.
- **Exact fix:** Render the structural sky frame synchronously from the hour-based base palette. Stream weather text and tint inside a smaller boundary. Add a short total NWS timeout. Replace the URL-backed turbulence SVG with CSS-only texture or another treatment that cannot become image LCP.

#### PERF-03: P1, Map keeps an auxiliary OpenStreetMap request in the primary visual path

- **Severity:** P1 (High).
- **Exact location:** `/map`; `src/components/map/AppMap.tsx:617-646,1557-1581` and `src/lib/integrations/overpass.ts:56-85,180-205`.
- **Evidence:** The initial interactive capture still shows “Loading public places from OpenStreetMap…” while 1,593 places and 19 events are already usable. The baseline map route took 16.5 seconds and included an external 504. In two WebGL-enabled Lighthouse runs, that loading chip itself is LCP at 9.63 and 9.62 seconds. The client tries three volunteer Overpass endpoints sequentially with a 90-second query timeout and no total fetch abort. See [Map loading](screenshots/map--mobile-375x812--loading.png), [Map populated](screenshots/map--mobile-375x812--viewport.png), [Map WebGL run 1](probes/lighthouse/map-webgl-run-1.json), and [Map WebGL run 2](probes/lighthouse/map-webgl-run-2.json).
- **Why it matters:** The map is usable, but the persistent chip says it is incomplete and turns a best-effort auxiliary source into the route's late visual milestone.
- **Exact fix:** Serve a cached OSM snapshot from the server or ISR. Add an 8 to 10 second total deadline and stale-cache fallback. Move background-refresh status into Layers instead of floating it over the primary map.

#### PERF-04: P2, Map serializes all places and ships optional layer code before intent

- **Severity:** P2 (Medium).
- **Exact location:** `src/components/map/AppMapClient.tsx:13-49`, `src/app/(app)/map/page.tsx:609-623`, and `src/components/map/BrowseMapClient.tsx:260-304`.
- **Evidence:** Map transfers about 1.85 to 1.89MB. The initial HTML and Flight document is about 1.03MB uncompressed. The client-only map chunk transfers about 471KB, and Lighthouse estimates about 371KB, or 78.7 percent, is unused in the initial state. See [Map Lighthouse JSON](probes/lighthouse/map-webgl-run-2.json).
- **Why it matters:** Users pay for county-wide data and optional layer logic before they indicate a viewport or layer intent, which raises parse, transfer, and interaction cost on mobile.
- **Exact fix:** Load the base map and county bounds first, then fetch cached viewport or intent-specific GeoJSON or vector pins. Lazy-load civic, aerial, community, cemetery, parking, and temporal-layer code when its panel is activated.

#### PERF-05: P2, Saved performs two post-hydration transitions before revealing its empty state

- **Severity:** P2 (Medium).
- **Exact location:** `/my-radius`; `src/components/saved/SavedList.tsx:139-230,576-603,1101-1142`, `src/hooks/useSaved.ts:61-63,85-89`, and `src/components/nav/AppMain.tsx:36-40`.
- **Evidence:** The empty-state paragraph becomes LCP at 9.77 to 9.93 seconds, with about 95 percent render delay. The two largest shifts are the site footer at 0.03064 and 0.02218; together they account for 90.7 percent of the route's repeatable 0.0583 CLS. The route first renders five skeleton rows, then `useMounted` triggers a render, and a second effect sets an empty Map before revealing the much shorter empty state. See [Saved mobile](screenshots/saved--mobile-375x812--viewport.png) and [Saved Lighthouse JSON](probes/lighthouse/saved.json).
- **Why it matters:** A simple empty state appears late and moves the page despite having no remote content to present.
- **Exact fix:** Server-render a stable generic Saved masthead and introduction. Derive no-slug emptiness directly instead of scheduling another state update. Match the loading shell to the empty layout and reserve enough height to keep the footer below the first viewport.

Image and critical-render notes: Lighthouse reports responsive sizing, efficient encoding, and modern formats as passing for images it can load. Below-fold cards generally use lazy loading. PERF-01 identifies a lazy image that should be the first visible photo lead, and CARD-01 identifies the incompatible fallback. Font delivery is a strength: Next variable fonts are subset to Latin and use `display: swap`. The critical-path defects are late server or client insertion rather than long blocking tasks on most routes.

### 2.10 Distinctiveness

#### DIST-01: P3, Search drops the field-guide language after its first card

- **Severity:** P3 (Refinement).
- **Exact location:** `/search?q=coffee`; `src/app/(app)/search/page.tsx:127-152,200-268`.
- **Evidence:** The lead uses the app's answer-card border and icon, but the rest of the 375 by 812 capture is a generic wall of identical raised rows with pin icon, name, category, and town. None includes the status, distance, source, field note, or coordinate-like instrument detail that makes Town and Place distinctive. Compare [Search mobile](screenshots/search-coffee--mobile-375x812--viewport.png) with [Town mobile](screenshots/town-frederick--mobile-375x812--viewport.png).
- **Why it matters:** Search is where the answer-engine promise is tested most directly, and generic rows make the product feel like a local directory.
- **Exact fix:** Keep one tactile answer card. Present supporting matches as a paper ledger with quiet dividers, open state, distance or town, one evidence badge, and progressive disclosure. Use the mono instrument line for distance and freshness, not decorative numbering.

Distinctive elements to preserve:

- The radius mark and concentric geometry in [Beta](screenshots/beta--desktop-1440x900--baseline.png).
- The paper palette, serif editorial display, mono field labels, and restrained tactile depth in [Today](screenshots/today--desktop-1440x900--baseline.png).
- The event plate and almanac grouping in [Events](screenshots/events--desktop-1440x900--baseline.png) and [event detail](screenshots/event-alive-at-five--desktop-1440x900--baseline.png).
- The county-wide spatial view and category-aware markers in [Map](screenshots/map--desktop-1440x900--baseline.png).
- The coordinate rule, local photo treatment, decision badges, and quoted evidence in [Town](screenshots/town-frederick--desktop-1440x900--baseline.png).
- Saved's deliberate desktop whitespace in [Saved desktop](screenshots/saved--desktop-1440x900--baseline.png).

### Cross-cutting governance

#### GOV-01: P2, project guidance no longer matches runtime navigation and tokens

- **Severity:** P2 (Medium).
- **Exact location:** `CLAUDE.md:19-22,43`, `src/components/nav/tabs.ts:43-47`, `next.config.ts:237-242`, and `src/app/globals.css:43,178-181`.
- **Evidence:** `CLAUDE.md` still names `#EEE6D4`, three radii, and an Ask `/guide` tab. Runtime uses `#EBE2CD`, four radii, four primary tabs, and a redirect from `/guide` to `/today`.
- **Why it matters:** New work can follow stale instructions and reintroduce removed navigation or obsolete token values.
- **Exact fix:** Update `CLAUDE.md` to describe the current four-tab shell, current background, four radii, and `/guide` redirect. Record the factual-live copy decision after the owner chooses it.

## Token inventory and consolidation proposal

### Verified inventory

Scope: 460 runtime UI source files, excluding API routes, tests, data, vendor code, cinematic marketing, and pitch pages.

| Category | Current inventory | Drift evidence |
|---|---:|---|
| Type size | 45 values | 38 fixed values and seven fluid formulas across about 2,034 sites |
| Font weight | 6 values | 300, 400, 500, 600, 700, and 800; 111 direct declarations |
| Color | 60 roles, including 14 tints | 315 raw primitives or expressions; 303 outside definitions; 932 occurrences in 111 files |
| Spacing and layout | 73 values | 54 fixed and 19 fluid or safe-area forms; 27 fixed values off the 4-pixel scale; 1,618 occurrences |
| Radius | 4 tokens | 24 computed values or forms; 117 hardcoded sites |
| Shadow | 12 tokens | 137 expressions or compositions; 108 hardcoded sites |
| Motion | 3 duration and 3 easing tokens | 56 effective duration values and 10 easing spellings |

The complete 38 fixed type-size list is: `8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 32, 34, 36, 40, 42, 44, 46, 60px`. The seven fluid formulas are the three display clamps in `src/app/globals.css:1391-1407,1484` plus `clamp(76px, 26vw, 120px)`, `clamp(34px, 8.5vw, 52px)`, `clamp(28px, 6vw, 40px)`, and `clamp(28px, 7vw, 40px)`.

### Mechanical target mapping

#### Type

Do not create a second scale. Finish adoption of the semantic classes already present in `globals.css`.

| Current | Target |
|---|---|
| 8 to 10.5px | 10px caption; retain 8 to 9px only for documented cartographic micro-labels |
| 11 to 11.5px | 11px meta |
| 12 to 12.5px | 12px meta-large |
| 13 to 13.5px | 13px body |
| 14 to 14.5px | 14px body-large |
| 15 to 15.5px | 15px title-small |
| 16 to 17px | 16px lead |
| 18 to 19px | 18px title |
| 20 to 27px | display tier 3 |
| 28 to 40px | display tier 2 |
| 42 to 60px | display tier 1 |

Use weights 400, 500, 600, and 700. Map 300 to 400 except an explicitly approved weather-display treatment. Map 800 to 700.

#### Spacing

Use `0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 80, 96px`. Apply these mechanical mappings: 3 and 3.5 to 4; 7 to 8; 10 and 11 to 12; 14 and 15 to 16; 19 to 20; 22 to 24; 26 to 28; 34 to 36. Preserve 1 to 2 pixel hairlines, optical nudges, safe-area formulas, and map geometry only when documented.

#### Color

Keep the current brand values and semantic roles. Use `--app-brand-press` for brand text on light surfaces and for filled controls with `--app-on-brand`. Use `--app-warning-press` for warning text or fills that need light text. Remove duplicate brief aliases only after consumers migrate to `--app-*` roles. Put Mapbox and Saved category exceptions in typed palettes. Replace `--app-ink-tint-8` with an existing tint or define it, and replace `--app-brand-tint-2` with the intended existing tint.

#### Radius

Expose `9px` small, `16px` medium, `24px` large, `32px` extra-large, and a new `9999px` full token. Map 7 to 13 to small, 14 to 20 to medium, 21 to 28 to large, 29 to 40 to extra-large, and all pill values such as 50 percent, 99, 999, and 9999 pixels to full. Preserve zero and documented micro geometry only.

#### Shadow

Replace loose composition with six public recipes:

1. `surface`: elevation 1 plus edge and highlight.
2. `raised`: elevation 2 plus edge and highlight.
3. `overlay`: elevation 3 plus edge and highlight.
4. `hero`: elevation 4 plus edge and highlight.
5. `inset`: edge plus highlight.
6. `brand`: brand glow.

Map legacy shadow 1, 2, and 3 to surface, raised, and overlay. Keep `--app-hi`, `--app-edge`, and `--app-lip` private to recipe definitions.

#### Motion

Use 160ms for micro feedback, 240ms for controls and small state changes, and 420ms for spatial entrances. Map 40 to 180ms to 160ms, 200 to 320ms to 240ms, and 340 to 700ms to 420ms. Keep 900ms as one documented camera-motion exception and route map movement through one easing function. Ambient cycles remain named component exceptions and must stop under reduced motion.

## Prioritized fix plan

1. **Restore tested semantic contrast pairs. Size M.** Dependencies: none. Implement the primary, warning, link, category, recurrence, bus, and town mappings; add a contrast matrix; rerun axe on all 27 captures. Resolves COLOR-01 and COLOR-02.
2. **Stabilize and server-render the first Events horizon. Size L.** Dependencies: an event-loading API boundary decision. Match fallback height, keep the footer stable, server-render the first horizon, prioritize the first visible photo, and stop serializing the full event collection initially. Resolves LAY-03, PERF-01, and part of TYPE-02.
3. **Repair the Map viewport and data-loading path. Size L.** Dependencies: choose cached GeoJSON or vector delivery and define the optional-layer split. Remove stale height reserves, serve cached OSM data with a bounded deadline, fetch pins by viewport or intent, and lazy-load optional layers. Resolves LAY-01, PERF-03, and PERF-04.
4. **Build the accessible Map marker seam. Size L.** Dependencies: a clustering and keyboard-navigation decision. Remove nested wrapper semantics, hide off-viewport pins from Tab, add roving focus and arrow navigation, cluster collisions, and size Mapbox controls. Resolves A11Y-01 and the Map portion of INT-01.
5. **Give detail pages one action owner per breakpoint. Size M.** Dependencies: none. Hide inline grids below `lg`, keep MobileActionBar below `lg`, reserve the full fixed stack, and make visible toolbar labels part of their controls. Resolves LAY-02 and INT-03.
6. **Ship the keyboard and semantic quick fixes. Size M.** Dependencies: none. Move the skip target, restore Browse focus, add Browse Close, replace pseudo-tab semantics, fix Claim ARIA, add the Events `h1`, correct Field notes, and add durable labels. Resolves TYPE-02 and A11Y-02 through A11Y-06.
7. **Turn Search into an actual answer flow. Size L.** Dependencies: location permission behavior plus a trustworthy open-hours and distance source. Name the direct answer with evidence, handle missing location honestly, add decision metadata, cap initial results, and render supporting matches as a ledger. Resolves COPY-01, CARD-02 on Search, and DIST-01.
8. **Fix place-photo fallback ownership. Size M.** Dependencies: choose a raster placeholder format. Return an optimizer-compatible fallback and centralize client `onError` handling. Resolves CARD-01.
9. **Make Today and Saved structurally available before personalized data. Size M.** Dependencies: none. Render SkyHero's frame synchronously, bound NWS retrieval, remove the texture as LCP, derive Saved emptiness directly, and reserve a stable personalized region. Resolves PERF-02 and PERF-05.
10. **Centralize target sizes and primary interaction states. Size M.** Dependencies: define the final shared control primitives. Make touch controls 44 by 44, stretch text inputs through their hit rows, give the beta CTA complete states, and migrate common button roles. Resolves INT-01, INT-02, and INT-04.
11. **Apply the token consolidation mechanically. Size L.** Dependencies: items 1 and 10 should establish final semantic color and control roles first. Adopt the type and spacing scales, fixed radii, six shadow recipes, three timing tiers, typed exception palettes, and undefined-token check. Resolves LAY-04, TYPE-01, COLOR-03, CARD-02, and MOTION-02.
12. **Respect reduced motion in runtime overlays. Size S.** Dependencies: none. Update PhotoLightbox and add an opened-state reduced-motion test. Resolves MOTION-01.
13. **Align copy and project guidance. Size S.** Dependencies: owner decision on factual uses of “live.” Correct beta and no-result copy, document the current navigation, background, and radii, then record the voice decision. Resolves COPY-02, COPY-03, and GOV-01.
14. **Refine nonessential alt text. Size S.** Dependencies: decide whether curated image descriptions are available. Use descriptive alt only when it describes the image; otherwise use empty alt beside the place `h1`. Resolves A11Y-07.

## Decisions needed before Phase 4

1. Should factual state labels such as “Live music” and “Live now” be an explicit exception in the voice guide, or should they be rewritten?
2. For Map keyboard access, should pins use clustering plus roving arrow navigation, or should the List alternative be the only sequential detail browser while visible pins expose a smaller landmark set?
3. For Search without location permission, should the lead ask for location, use the selected town center, or avoid a nearest claim entirely?
4. For place photos, should the central fallback be a branded raster illustration or a category-colored typographic plate?

No Phase 4 implementation should begin until the fix scope and these product choices are approved.
