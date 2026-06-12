# Agent B: Decision Density Audit

Phase 0 of the premium redesign program. Date: 2026-06-12. Method: full read of the 8 primary screen sources, import-graph tracing for every contested component (`grep` for importers across `src/app` and `src/components`), and four parallel code sweeps reconciled against the page sources. Zero code changes were made. Every count below is a count of rendered interactive elements (links, buttons, inputs, toggles), including elements server-rendered inside collapsed disclosures, because `CollapsibleSection` ships its children in the HTML and hides them with the `hidden` attribute (src/components/ui/CollapsibleSection.tsx:20-25, 112-114).

A finding that frames everything else: the codebase carries roughly 40 components with zero importers. The decision surface a user sees is large; the decision surface a developer sees is materially larger, and several prior consolidation passes deleted render sites without deleting components. Section 1 lists the dead set.

---

## 1. Component census

File totals (verified by `find`): 253 `.tsx` component files plus 10 `.ts` support modules under `src/components/`. 22 of the 253 live in `src/components/marketing/` and render only on `/pitch` (the marketing shell; confirmed via src/app/pitch/page.tsx:2, which imports only `MasterSceneManager`).

### 1.1 Class totals

Each `.tsx` file was assigned one class. Display is the residual class (everything presentational, plus providers, utility wrappers, and the 22 marketing scenes).

| Class | Count | Representative members |
|---|---|---|
| navigation | 22 | BottomNav, SideRail, TopBar, AppFooter, LocationChip, TownStrip, TownLinks, TownPicker, MapModeToggle, SetTownInline, StayDeepLinks, MunicipalityStrip |
| filter/chip | 18 | Pill, FilterChip, Segmented, SortDropdown, MapIntentChips, MapTimeChips, RadiusPresets, TimeToggle, CravingStrip, plus 7 dead (TodayFilters, TodayTabs, MoodTiles, InterestsChip, HomeMuniChip*, LensBar, HiddenSectionsBar) |
| badge | 17 | Chip, ReasonChip, TrustChip, FreshnessChip, SourceBadge, OpenClosedDot, PlaceStatus, LiveDot, AirQualityBadge, PulseIndicator, BeenHereIndicator, LiveTransitPill |
| CTA/button | 27 | Button, SaveButton, MyRadiusButton, ShareButton, BeenHereToggle, EventActions, EventCalendarButton, InstallPrompt, NotificationsNudge, FromAboveCta, ModeAwareCta, animated-button |
| card | 32 | PlaceCard, EventCard, SeriesCard, AnswerCard, TodayCard, WeeklyCard, BetaIntroCard, MetricCard, CivicCard, KnownForCard, BusinessExtrasCard, glass-card, plus 8 dead card files |
| sheet/drawer/overlay | 10 | Sheet, BottomDrawer, MoreSheet, PlaceSheet, MapControlSheet, SearchOverlay, PhotoLightbox |
| input | 9 | SearchInput, LocationAutocomplete, ClaimForm, SubmitEventForm, SubmitPlaceForm, PlanBuilder, RadiusBuilder, PreferencesPanel |
| display | 118 | Heroes, forecasts, sparklines, maps, rails, skeletons, dividers, providers, and all 22 marketing scenes |
| Total | 253 | |

*HomeMuniChip is live through DateLine (src/components/today/DateLine.tsx imports it); the other six chip components in the dead list have no importer.

Support modules (10 `.ts`): map/applyFrederickPalette, map/categoryMarkers, map/constants, map/countySpotlight, map/types, nav/tabs, plan/actions, submit/actions, business/manage-actions, answer/index.

### 1.2 Primitive proliferation

Six button-like primitives coexist: `ui/Button.tsx`, `ui/Pill.tsx`, `ui/Chip.tsx`, `ui/FilterChip.tsx`, `ui/Segmented.tsx`, `ui/animated-button.tsx` (the last is pitch-only). Pill and FilterChip do the same job (a tappable filter token) with different APIs; FilterChip survives in exactly two live render sites (src/components/radius/RadiusBuilder.tsx:8 and the dead TodayFilters).

Seven sheet/drawer/overlay containers coexist: `ui/Sheet.tsx`, `ui/BottomDrawer.tsx`, `nav/MoreSheet.tsx`, `place/PlaceSheet.tsx`, `radius/MapControlSheet.tsx`, `search/SearchOverlay.tsx`, `ui/PhotoLightbox.tsx`. Three of these (BottomDrawer, MapControlSheet, PlaceSheet) are independent bottom-sheet implementations.

### 1.3 Dead components (zero importers in src/app or src/components)

Verified by import tracing. Each name below has no live render path; entries marked "transitively" are imported only by another dead file.

- today/: MoodTiles, FeaturedEvents, FeaturedTonightPicker (and FeaturedTonight transitively), HistoryPulse (and HistoryDeck transitively), NearbyNow, RedditPulse, FromAboveTile, PrimaryActionCard, TodayTabs, TodayFilters, TodayActions, TodayAsk (and ask/AskFrederick transitively), LocalNewsStrip, HiddenSectionsBar, AdaptiveGreeting (and PersonalGreetingLine, InterestsChip transitively), ModeLead (and today/ModeToggle transitively), ExploreFooter, AlmanacFooter, ComingSoon, ClusteredSpires, RidgeLine, TuneForYou, FloatingPlanFab, RightNow (and RightNowGrid transitively), WeatherHero, SunCountdown, LivePulse, LiveActivityPill, Module
- now/: RightNow, RightNowStrip
- event/: LensBar, WeekStrip, CategoryJumpTiles, EventsByTown, EventsCompartmented
- mode/: ModeSwitch
- radius/: BestNearbyMoves, WithinReach
- ui/: Shelf, CreekHairline, StatStrip
- App-dead, pitch-only: map/index.tsx, map/map-component.tsx, ui/glass-card.tsx, ui/animated-button.tsx, ui/gradient-text.tsx (imported only from src/components/marketing/scenes/MapHeroScene.tsx and other scenes)

Count: 41 dead or pitch-stranded files out of 253, about 16 percent of the component tree. The /today page header comment even documents ten of the cuts as archeology (src/app/(app)/today/page.tsx:68-87) while the files remain.

---

## 2. Card variants

Counting rule: a distinct card design is a unique combination of layout structure (image position, text stack, metadata row), regardless of file name. Prop-driven structural variants count separately. Dead components are excluded from the production count and listed at the end.

### 2.1 Distinct card designs in production: 35

PlaceCard family (one file, five structures), src/components/place/PlaceCard.tsx:

| # | Design | Lines | Structure | Renders on |
|---|---|---|---|---|
| 1 | PlaceCard row | 489+ (`variant === "grid"` ends 480; row is the default branch) | 52px left thumb, 3-line stack, status/rating/price row | /guide results "Also good" (FunnelFlow.tsx:597), /places favorites (places/page.tsx:199), saved lists, /m pages |
| 2 | PlaceCard grid | 447 | 40px top-left thumb, 2-line clamp, bottom color band | RadiusBuilder grid groups (RadiusBuilder.tsx:1473), category pages |
| 3 | PlaceCard tile | 382 | fixed 244px column, header row with thumb and open dot, chips, color band | HiddenGemsRail (HiddenGemsRail.tsx:55), shelf rails |
| 4 | PlaceCard feature | 240 | left thumb plus 3px accent bar, serif title, why-chips | /map radius best match (RadiusBuilder.tsx:1130) |
| 5 | PlaceCard answer | 295 | top accent bar, uppercase category, serif display title, decision row, quote block | /guide best match (FunnelFlow.tsx:662) |

EventCard family (one file, six structures), src/components/event/EventCard.tsx:

| # | Design | Lines | Structure | Renders on |
|---|---|---|---|---|
| 6 | EventCard utility | 110 | dot, title, right-aligned date; border-b row | civic and municipal long-tail lists |
| 7 | EventCard compact | 154 | left date pill, dot, title and meta, right distance | dense event lists |
| 8 | EventCard feature | 254 | 60px date block, serif title, why-it-matters line, chips | /events hero (events/(list)/page.tsx:349), /today featured (today/page.tsx:503) |
| 9 | EventCard tile | 327 | date block header, clamped title, bottom color band | /today What's-on rail (today/page.tsx:510) |
| 10 | EventCard glance | 416 | big serif time column, title and venue, right icon tile, left inset bar | /events "Later this week" (events/(list)/page.tsx:449), civic and reminder lists (:527, :547) |
| 11 | EventCard row (default) | 539 | date block, title with status, category and trust chips | saved events, venue pages |

Standalone component cards:

| # | Design | File:lines | Renders on |
|---|---|---|---|
| 12 | SeriesCard (recurring civic series, expandable occurrences) | event/SeriesCard.tsx:32-157 | /events municipal calendar via MunicipalEvents |
| 13 | TonightRail photo card (photo backdrop, category chip, serif title) | event/TonightRail.tsx:46+ | /events "More tonight" (events/(list)/page.tsx:376) |
| 14 | AnswerCard (color spine, status badge, supporting line, optional photo plate) | answer/AnswerCard.tsx:54+ | /today lead (today/page.tsx:393) |
| 15 | TodayCard (typographic weather hero overlay, no border) | today/TodayCard.tsx:131-188 | /today inside SkyHero (today/page.tsx:608) |
| 16 | WeeklyCard (disclosure card with summary row) | today/WeeklyCard.tsx:75-115 | /today weather panel (today/page.tsx:668) |
| 17 | BetaIntroCard (icon, headline, dismiss) | today/BetaIntroCard.tsx:48-83 | /today (today/page.tsx:436) |
| 18 | MoveStack itinerary card (numbered timeline) | today/MoveStack.tsx:23-105 | /today (today/page.tsx:473) |
| 19 | WorthALook tile (152px, color band, serif name) | today/WorthALook.tsx:40-74 | /today "More for today" (today/page.tsx:732) |
| 20 | LocalNewsRail row card (source badge, title, timestamp, exit arrow) | today/LocalNewsRail.tsx:58+ | /today "More for today" (today/page.tsx:735) |
| 21 | KnownForCard (chips block, "What people say") | place/KnownForCard.tsx:43-130 | place detail (places/[slug]/page.tsx:261) |
| 22 | BusinessExtrasCard ("Good to know" dl rows with provenance) | place/BusinessExtrasCard.tsx:36-86 | place detail (places/[slug]/page.tsx:272) |
| 23 | CivicCard (contact and schedule rows, provenance footer) | municipality/CivicCard.tsx:65-93 | /m/[municipality] |
| 24 | MetricCard (accent stripe, hero value, sparkline) | live-data/MetricCard.tsx:69-184 | /rivers |
| 25 | RadiusPresets card (icon circle, label, blurb; 140px) | radius/RadiusPresets.tsx:31-36, 74-114 | /map radius controls (RadiusBuilder.tsx:817) |

Inline card-shaped JSX in page and feature files (each a distinct structure, none reusable):

| # | Design | File:lines | Renders on |
|---|---|---|---|
| 26 | Guide bento Tile (frosted lane, icon stamp, count; lead variant spans 2 columns) | guide/FunnelFlow.tsx:749-810 | /guide front door |
| 27 | Guide town-door row (icon, two-line label, chevron) | guide/FunnelFlow.tsx:418-439 | /guide |
| 28 | LiveDowntown sunset card (gradient, glow, series eyebrow, when pill) | guide/LiveDowntown.tsx:47-110 | /guide marquee |
| 29 | Events mood tile (frosted accent wash, icon stamp, label; 3-up) | app/(app)/events/(list)/page.tsx:413-432 | /events "Browse by mood" |
| 30 | Places need tile (104px frosted gradient, icon stamp; 2-up/4-up) | app/(app)/places/page.tsx:143-175 | /places "Start with a need" |
| 31 | Places category tile (icon stamp, name, count; 2-up/3-up) | app/(app)/places/page.tsx:284-318 | /places "By category" |
| 32 | Places "Who to call" row card (radial wash, icon, two-line, arrow) | app/(app)/places/page.tsx:216-267 | /places |
| 33 | MunicipalityStrip town card (name, this-week count, next move) | today/MunicipalityStrip.tsx | /places "By town" (places/page.tsx:336) |
| 34 | RadiusBuilder utility tile (icon stamp over label, 5-up grid) | radius/RadiusBuilder.tsx:1135-1157 | /map radius |
| 35 | RadiusBuilder event row (date block, title, meta; a second event-row design parallel to EventCard) | radius/RadiusBuilder.tsx:1184-1222 | /map radius "Happening within reach" |

### 2.2 Dead card designs (in the tree, not in production)

MoodTiles (today/MoodTiles.tsx:54-135), FeaturedTonight (today/FeaturedTonight.tsx:18-79), FeaturedEvents carousel (today/FeaturedEvents.tsx:45-154), HistoryDeck (today/HistoryDeck.tsx:89-287), NearbyNow section cards (today/NearbyNow.tsx:104-444), RedditPulse (today/RedditPulse.tsx:28-99), FromAboveTile (today/FromAboveTile.tsx:24-112), PrimaryActionCard (today/PrimaryActionCard.tsx:73-148). Eight more designs, all with zero importers.

### 2.3 Gap to target

The redesign target is at most 3 card types. Production carries 35 distinct designs. The gap is 32. Near-duplicates that merge with no information loss: PlaceCard row vs grid (dimension differences only); EventCard glance vs compact (same time-first row, different right column); EventCard feature vs tile (same date-block grammar); RadiusBuilder event row vs EventCard compact (parallel implementations of the same row); LocalNewsRail row vs the dead RedditPulse row (identical list-row anatomy); guide bento Tile vs places need tile vs events mood tile (the same frosted icon-stamp tile rebuilt inline three times at three sizes).

---

## 3. Chip and filter vocabularies

Counting rule: a vocabulary is one set of tappable options that filters, scopes, or re-sorts content. Sets with zero importers are excluded from the live count and listed at the end.

### 3.1 Live vocabularies: 22

On /map (both modes reachable through one toggle), 12 vocabularies:

| # | Vocabulary | File:lines | Options | What it changes | Primitive |
|---|---|---|---|---|---|
| 1 | Map mode toggle | map/MapModeToggle.tsx:30-33 | Nearby, Whole county | ?mode=radius or browse; swaps the entire control system | Segmented |
| 2 | Intent chips (browse) | map/MapIntentChips.tsx:277-308; data src/data/intents.ts:342+ | All plus 12 intents (Coffee, Eat and drink, Wineries, Breweries, Get outside, Family, Arts, Wellness, Civic, Shop, Stay, Faith) | ?intent=; filters the 1,700-place set | custom styled Links |
| 3 | Sub-intent chips (browse) | map/MapIntentChips.tsx (sub strip); data intents.ts | All plus 2 to 14 per parent; 56 sub-options total (eat alone has 14) | ?sub=; second-tier filter | Pill |
| 4 | Time chips (browse) | map/MapTimeChips.tsx:24-33 | Now, Tonight, Weekend, Upcoming | ?t=; event-pin window | Pill |
| 5 | Open-now toggle (browse) | map/MapTimeChips.tsx (adjacent pill); map/page.tsx:462-466 | Open now | ?open=now; third-tier place filter | Pill |
| 6 | Layers drawer, categories | map/AppMapDeck.tsx:502-618 | All, Saved, Coffee, Churches, plus 14 top categories (data/categories.ts: 52 categories, 14 top-level) = 18 toggles | client state activeCats; which pins draw | raw buttons in BottomDrawer |
| 7 | Layers drawer, amenity groups | map/AppMapDeck.tsx:633-654; map/constants.ts:73+ | 12 groups: Restrooms, Water, Trash, Dog stations, Wifi, EV charging, Bike, Sit and picnic, Playgrounds, Pools, Gauges, AED and shelter | amenity point layers | raw buttons |
| 8 | Layers drawer, infrastructure and GIS overlays | map/AppMapDeck.tsx:656-790; lib/overlays.ts:38-81 | Roads and alerts, Transit, Trails, Aerial photos, plus 6 GIS overlays (Parks, Historic cemeteries, Public art, Farmers markets, Covered bridges, Trails), plus Reset | ?layers=; line and point overlays | raw buttons |
| 9 | Radius presets (radius mode) | radius/RadiusPresets.tsx:31-36 | 5 min walk, 15 min walk, 15 min bike, 30 min bike, 10 min drive, 30 min drive | mode plus minutes in one tap | custom preset cards |
| 10 | Travel-mode segmented plus slider (radius mode) | radius/RadiusBuilder.tsx:853-892 | Walk, Bike, Drive, plus a 3-to-30-minute range input | same state as #9, expressed twice | raw buttons plus input[type=range] |
| 11 | Open-only toggle (radius mode) | radius/RadiusBuilder.tsx:1263-1279 | Showing open only / Open now · N | client filter on in-radius places | raw button |
| 12 | Cuisine facet chips (radius mode, food group) | radius/RadiusBuilder.tsx:1444-1455 | All plus cuisine facets | narrows the Eat group | FilterChip |

Elsewhere, 10 vocabularies:

| # | Vocabulary | File:lines | Options | What it changes |
|---|---|---|---|---|
| 13 | Today time toggle | today/TimeToggle.tsx:21-30 | Now, Tonight, Tomorrow, Weekend | /today ?t=; events slice |
| 14 | CravingStrip | now/CravingStrip.tsx:42-55; data/cravings.ts (8 entries) | Coffee, Ice cream, Food, Pizza, Sweets, Drinks, Outside, plus 1 | links to /nearby?c=, which is a redirect to /guide that DROPS the param (app/(app)/nearby/page.tsx:11-13). All 8 chips are dead ends. |
| 15 | Guide intent tiles | guide/FunnelFlow.tsx:47, 373-392 | Eat and drink, Coffee, Get outside, Shop, Arts, Family | ?need=; same INTENTS data as map vocabulary #2 |
| 16 | Guide sub-intent rail | guide/FunnelFlow.tsx:461-493 | All plus the active intent's subIntents | ?sub=; same data as map vocabulary #3 |
| 17 | Guide moment lenses | guide/FunnelFlow.tsx:83-91, 400-414 | Date night, With kids, Happy hour (conditional), Dog-friendly, Live music | client lens state |
| 18 | Guide result filters and sort | guide/FunnelFlow.tsx:497-534 | Open now, Near me/Near you, Walkable (geo-gated), Local favorite, plus sort: Best, Nearest (geo-gated), Top rated | client filters and sort |
| 19 | Events quick chips | event/EventsExplorer.tsx:304-327 | Today, This weekend, Live music, Free, Happy hour, Family, Civic | explorer time/category/boolean state |
| 20 | Events view segmented | event/EventsExplorer.tsx:42-47, 355-360 | List, Compact, Agenda, Map | presentation mode |
| 21 | Events facet drawer | event/EventsExplorer.tsx:466-508 | All plus ~10 categories; All plus ~14 towns | explorer cat and town state |
| 22 | Events week ribbon | event/EventWeekRibbon.tsx:21-22, 115+ | 7 day cells with counts | ?d=YYYY-MM-DD |

Adjacent sets counted as navigation rather than filters (see Section 4): events mood tiles (events/(list)/page.tsx:281-288), places need tiles (places/page.tsx:143-175), TownStrip (municipality/TownStrip.tsx:43-53), LocationChip town menu (nav/LocationChip.tsx:153-174), SearchOverlay suggestion chips (search/SearchOverlay.tsx:593-656). Sort dropdowns also render on /places lists and saved lists (ui/SortDropdown.tsx via place/PlaceList.tsx, saved/SavedList.tsx:461).

### 3.2 Dead vocabularies: 7

TodayTabs (today/TodayTabs.tsx:128-205, 5 tabs), TodayFilters (today/TodayFilters.tsx:14-29, 7 vibe plus 4 time chips), MoodTiles (today/MoodTiles.tsx:44-52, 6 tiles), InterestsChip (today/InterestsChip.tsx:33-42), LensBar saved views (event/LensBar.tsx:62-143), WeekStrip 14-day rail (event/WeekStrip.tsx:84-217), CategoryJumpTiles (event/CategoryJumpTiles.tsx:20-72). None has an importer.

### 3.3 Duplication verdict

- Four parallel TEMPORAL vocabularies are live: map time chips (#4: Now/Tonight/Weekend/Upcoming), today toggle (#13: Now/Tonight/Tomorrow/Weekend), events quick chips (#19: Today/This weekend), events week ribbon (#22: a 7-day picker). Four different option sets answer the same question, "when," with three different URL grammars (?t=, ?d=, explorer state).
- Three parallel CATEGORY systems are live on the map route alone: intent chips (#2/#3, 13 plus 56 options), Layers categories (#6, 18 toggles), amenity groups (#7, 12 toggles). The guide tiles (#15/#16) are a fourth rendering of the same INTENTS data on another route, and the places need tiles deep-link into a fifth (?intent= on /map).
- "Open now" exists as four separate controls: map browse (#5), radius (#11), guide (#18), and the /open-now route itself.

App-wide total: 22 live chip/filter vocabularies (29 counting the dead ones still in the tree). /map alone renders 12.

---

## 4. Navigation patterns

### 4.1 Pattern inventory

| Pattern | Count | Source |
|---|---|---|
| Bottom-nav tabs (mobile) / SideRail (desktop) | 5 tabs, one source of truth | nav/tabs.ts:44-50 (Ask /guide, Today, Map, Events, Saved /my-radius); BottomNav.tsx; SideRail.tsx |
| TopBar actions | 4 on phones, 5 from sm | back-or-wordmark (TopBar.tsx:121-157), search pill (:165-186), PulseIndicator to /pulse (:206), More button (:219-230), LocationChip sm+ (:235-237) |
| MoreSheet drawer destinations | 12 | nav/MoreSheet.tsx:61-74 (Useful: /pulse, /plan, /parking, /amenities, /contacts, /transit, /trails, /parks, /rivers) and :77-80 (App: /about, /trust, /settings) |
| LocationChip dropdown | 14 items | nav/LocationChip.tsx:121-144 (use/clear location) and :153-174 (13 town links to /m/[slug]) |
| AppFooter links | 5 | nav/AppFooter.tsx:17-23 (/about, /trust, /towns, /places, /events); rendered app-wide via nav/AppMain.tsx |
| Segmented controls | 2 live | MapModeToggle (map/MapModeToggle.tsx:30-33), events view switch (EventsExplorer.tsx:355-360) |
| In-page tab strips | 0 live | TodayTabs is dead code; TimeToggle and the week ribbon are filters, not tabs |
| Breadcrumbs | 1 | place detail only (places/[slug]/page.tsx:195-207, 3 links) |
| Drawers/sheets that carry navigation | 3 | MoreSheet, LocationChip menu, SearchOverlay quick answers (SearchOverlay.tsx:321-345) |
| "See all" / "view all" links | 9 live render sites | HiddenGemsRail.tsx:41-48, DismissibleSection.tsx:76-83 and 108-115, CivicAlerts.tsx:163, AppMapClient.tsx:594-600, SavedList plan strip:396, events later-this-week:454-461, RadiusBuilder events:1228-1234, FromYourSaved "All saved", SectionHeading default cta |
| Mode switch (Resident/Visitor) | 0 live render sites | mode/ModeSwitch.tsx and today/ModeToggle.tsx both have zero importers; the persona system has no surviving UI |

### 4.2 Route reachability (35 routes under src/app/(app)/)

- Tab routes (5): /guide, /today, /map, /events, /my-radius (tabs.ts:44-50). Root / redirects to /guide (app/(app)/page.tsx:8).
- Persistent chrome (13): /pulse (PulseIndicator and MoreSheet:62), /plan (:63), /parking (:64), /amenities (:65), /contacts (:66), /transit (:67), /trails (:68), /parks (:69), /rivers (:74), /about (:78), /trust (:79), /settings (:80), /m/[municipality] (LocationChip.tsx:158); plus /towns, /places, /events via AppFooter:17-23.
- In-page only (11): /search (TopBar search pill opens the overlay; FunnelFlow.tsx:339; places/page.tsx:100), /towns (FunnelFlow.tsx:418; AppFooter), /places (AppFooter; breadcrumb places/[slug]/page.tsx:197), /places/[slug] (every card), /events/[slug] (every card), /events/calendar (events/(list)/page.tsx:327-334 "Month" and :454-461), /category/[slug] (places/page.tsx:287, place detail footer :459, RadiusBuilder:1139), /collections and /collections/[slug] (about page:498; HiddenGemsRail:42 links to one collection), /history (about page:461 only; the other inbound, HistoryDeck.tsx:274, is dead code), /open-now (places need tile, places/page.tsx:145; SearchOverlay quick answers), /settings/notifications (from /settings and NotificationsNudge).
- Redirect stubs (3): /find and /nearby redirect to /guide, /weekend redirects to /events (each page.tsx is a bare `redirect()`).
- Orphan (1): /terms. Zero inbound `href` anywhere in src/ (grep across src/app and src/components returned no link outside the route itself). It is reachable only by typing the URL.
- Near-orphans (2): /history and /collections each hang from a single link on /about, a page that itself sits behind the More sheet. Both are two low-discoverability hops from any tab.
- Broken funnel (1): the 8 CravingStrip chips on /today link to /nearby?c= (CravingStrip.tsx:47), and /nearby is a redirect that discards the query (nearby/page.tsx:11-13). The chips silently dump users on /guide with no craving applied. The /nearby retirement comment even states "nothing linked to it," which was false the day it was written: /today did.

### 4.3 Count

46 distinct always-available navigation targets sit in persistent chrome alone (5 tabs + 4-5 TopBar + 12 MoreSheet + 14 LocationChip + 5 footer + wordmark + ⌘K). Before a user reads any page content, the shell offers roughly four dozen places to go.

---

## 5. Decision-density heatmap

Counting rule: every rendered interactive element on the default state of the screen, including content server-rendered inside collapsed disclosures (it ships in the HTML; CollapsibleSection.tsx:112-114). Chrome adds 9 on phones (4 TopBar + 5 tabs). Budget: at most 5 interactive choices above the fold, exactly 1 primary action. Overshoot multiple = total rendered choices / 5, matching the program's stated formula.

### 5.1 Per-screen tallies

home (/). A pure redirect to /guide (app/(app)/page.tsx:8). It inherits the guide's entire count. Tally: 33. Primary actions: see guide.

guide (/guide). In-page: search door 1 (FunnelFlow.tsx:339), 6 intent tiles (:373-392), moment-lens disclosure 1 plus 5 hidden pills (:400-414), town door 1 (:418), 3 LiveDowntown cards (LiveDowntown.tsx:105-110), Hidden gems "See all" 1 plus 6 tiles (HiddenGemsRail.tsx:41-57). In-page 24, plus chrome 9, total 33. Overshoot 6.6x. Above the fold on a phone: search plus the lead tile and roughly two more tiles, on top of 9 chrome controls, roughly 13 against a budget of 5. Primary actions: 2 compete (the Ask search door and the lead Eat-and-drink tile).

today (/today). In-page visible tier: HomeMuniChip 1 (DateLine), CravingStrip 8 (:376, all broken, see 4.2), AnswerCards 3 (:393), utility links 2 (:419), BetaIntroCard 2 (:436), TodayMoves 3 links (TodayMoves.tsx:136, 174, 190), MoveStack about 3 place links (MoveStack.tsx:70), TimeToggle 4 (:491), DismissibleSection "See all" plus hide 2, event hero plus up to 6 tiles 7 (:503-513). Hidden but rendered: full-briefing trigger 1 (:550), TodayCard tonight link 1, three weather disclosures 3 (:657-683), More-for-today trigger 1 (:724), PartnerApps 2, WorthALook 6 (lib/worth-a-look.ts:90 returns 6), LocalNewsRail 6 (:38 caps at 6), FromAboveCta 1. In-page about 56, total about 65. Overshoot 13.0x. Primary actions: at least 3 compete for "the move" (featured AnswerCard, TodayMoves lead, the event hero).

map (/map, default radius mode). Mode toggle 2 (RadiusBuilder.tsx:1101), center select 1 with 14 options (:738-768), locate 2 (:776, :1035), 6 presets (RadiusPresets.tsx:31-36), fine-tune trigger plus 3 modes plus slider 5 (:830-892), sheet snap controls 2 (:1069, AppMapClient-style handle), best-match card 1 (:1124), 5 utility tiles (:1135-1157), up to 5 event rows plus 1 see-all (:1180-1234), open-now toggle 1 (:1263), see-everything toggle 1 (:1350), about 12 category-group expanders (:1374). In-page about 44, total 53. Overshoot 10.6x. Browse mode is worse: mode 2, intent 13, time 4 plus open 1, deck search/near-me/Layers 3, Layers drawer 42 toggles (AppMapDeck.tsx:502-790: All, Saved, Coffee, Churches, 14 categories, amenity expander plus 12 groups, civic, transit, trails, aerial, 6 GIS overlays, reset), list expand 2; about 67 in-page, 76 total, 15.2x. Primary actions: none is marked; the best-match card competes with 6 presets and a select.

events (/events). Visible tier: Month pivot 1 (:327), hero card 1 (:349), week ribbon 7 (:363), TonightRail up to 8 (:376), weekend section open by default with roughly 15 glance cards (:384-392, count varies by week), 6 mood tiles (:413-432), 5 collapsed-section triggers (:439, :471, :517, :537, :558), submit link 1 (:586). Visible about 46. Hidden but rendered: Later this week 24 cards plus 1 calendar link (:447-461), explorer about 40 controls (7 quick pills :304-327, search input :339, 4 view segments :355, filters button :371, sort :413, drawer with All plus ~10 categories :466-480 and All plus ~14 towns :494-508), civic meetings 24 (:525), town reminders 24 (:545), municipal calendar up to 80 SeriesCards with an expander and links each, roughly 160 (:566 via MunicipalEvents). In-page roughly 310 rendered interactive elements; total about 320. Overshoot 62x, the worst screen in the app by a factor of four. Primary actions: the hero is a clear lead, but 13 same-weight section mechanisms surround it.

places (/places). Search door 1 (:100), 8 need tiles (:143-175), 4 favorite cards (:192-204), Who to call 1 (:216), about 12 category tiles (:284-318; 14 top categories filtered to nonzero), 13 town cards (MunicipalityStrip, :336). In-page 39, total 48. Overshoot 9.6x. Primary actions: 2 compete (search door, need-tile grid).

my-radius (/my-radius). Settings 1 (:50), SavedList: sort dropdown 1 (SavedList.tsx:461), plan strip 0-1 (:396), N saved cards (0 for a new user; the empty state offers 6 seed links), recents up to 6 plus clear 1 (:583-598), sync link 1 (:77), notifications nudge up to 1 (:99). Typical in-page about 15, total 24. Overshoot 4.8x. The only screen near budget, and the only one with one clear primary action.

place detail (/places/[slug]). Breadcrumb 3 (:195-207), MyRadiusButton 1 (:249), BeenHereToggle 1 (:325), action grid 2-4 (:328-333), integration rows 0-8, typically 2 (:363-393), photo gallery lightbox triggers about 4 (:401), mini-map 1 (:407), AerialBeat up to 1 (:411), venue events about 2 (:432), Near here 5 (:444), footer 3 (:459-473). In-page about 26, total 35. Overshoot 7.0x. Primary actions: 2 compete (Add to My Radius vs the 4-button directions grid).

### 5.2 Ranking

| Rank | Screen | Rendered interactive choices (in-page + chrome) | Overshoot vs 5-choice budget | Primary actions rendered (budget: 1) |
|---|---|---|---|---|
| 1 | events | ~320 | 62x | 1 hero + 13 competing section mechanisms |
| 2 | map (browse mode) | ~76 | 15.2x | 0 marked |
| 3 | today | ~65 | 13.0x | 3 competing |
| 4 | map (default radius mode) | ~53 | 10.6x | 1 + 6 presets competing |
| 5 | places | ~48 | 9.6x | 2 competing |
| 6 | place detail | ~35 | 7.0x | 2 competing |
| 7 | guide | ~33 | 6.6x | 2 competing |
| 7 | home (redirects to guide) | ~33 | 6.6x | inherits guide |
| 9 | my-radius | ~24 | 4.8x | 1 |

Every screen except my-radius runs at least 6x over budget. The persistent chrome alone (9 controls) nearly doubles the 5-choice budget before page content renders.

---

## Five highest-leverage consolidations

1. Delete the 41 dead files (Section 1.3). This removes 8 card designs, 7 chip vocabularies, the entire orphaned persona-mode UI, and about 16 percent of the component tree for zero user-visible loss. It also stops the next audit from re-counting ghosts: two of the four sweeps in this audit initially reported dead components (TodayTabs, MoodTiles, HistoryDeck, LensBar) as live surfaces.

2. One temporal control. Merge MapTimeChips (map/MapTimeChips.tsx:24-33), TimeToggle (today/TimeToggle.tsx:21-30), the events quick time chips (EventsExplorer.tsx:304-327), and the week ribbon (EventWeekRibbon.tsx) into one "when" component with one option set and one URL grammar (?t=). This removes 3 vocabularies and ends the situation where Tonight means 16:00 on the map (map/page.tsx:160) and 17:00 on /today (today/page.tsx:221).

3. One category system on the map. The map route currently runs intent chips (13 plus 56 sub-options), an 18-toggle Layers category cluster, a 12-toggle amenity cluster, and an 11-toggle infrastructure cluster (AppMapDeck.tsx:502-790). Collapse Layers categories into the intent taxonomy and cap the drawer at amenities plus overlays. This single change removes roughly 40 rendered decisions from the app's third-busiest screen and eliminates the duplicated coffee toggle (intent chip, Layers chip, and craving chip are three roads to the same filter).

4. Three card types. Standardize on (a) a row card (PlaceCard row absorbing grid, EventCard glance absorbing compact, row, utility, and RadiusBuilder's inline event row), (b) a rail tile (absorbing PlaceCard tile, EventCard tile, WorthALook, the three inline frosted tiles on /guide, /places, and /events), and (c) a hero/feature card (absorbing PlaceCard feature and answer, EventCard feature, AnswerCard, TonightRail). That is 35 designs down to 3 plus a small set of data blocks (hours, civic contacts, metrics) that are tables, not cards. The gap closed: 32 designs.

5. Cut /events to one tier and fix the /today dead end. Move the civic meetings, town reminders, and the 80-series municipal calendar off the main events page onto a /events/civic sub-route reached by the existing "Government and notices" divider (events/(list)/page.tsx:499-511), and stop server-rendering the collapsed explorer until opened. That takes /events from roughly 320 rendered choices to under 60. On /today, either point CravingStrip at a live surface that honors the craving (the map's open-now lens) or delete it; today its 8 chips are the most prominent controls on the briefing and every one of them silently discards the user's choice (CravingStrip.tsx:47 against nearby/page.tsx:11-13).
