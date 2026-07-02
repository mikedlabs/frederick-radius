# Experience Review — July 2026

A ten-dimension expert review of the whole app: every major surface's UX, performance
against the live production deployment, platform architecture, visual craft, creative
differentiators, and launch-readiness blind spots. Ten specialist reviewers read the
code AND measured the live site behind the beta wall; every finding below is anchored
to a file, route, or live measurement — none of it is generic advice.

Read this like MAP_AUDIT.md: a sequenced working document, not a wishlist. Findings are
sorted high → low impact within each dimension, each tagged [IMPACT · EFFORT S/M/L].

## The headline (what the whole review adds up to)

1. **Three shipped promises are silently broken in production** and outrank everything
   else: the Ask tab (nav slot #1) returns `configured:false` (no AI key in Vercel);
   signed-in saves never appear on the Saved tab (useFollows writes the DB, SavedList
   reads only localStorage); and /today is time-blind at its prime evening moment
   (ended 2-4 PM library events outrank a live Keys game; the tonight hero renders
   empty on the nights it matters).
2. **The app is fast except where it matters most:** /map ships 3.65 MB of HTML (1,627
   full place records in one flight script) and /events ships 1.14 MB (all 613 events),
   both render fully dynamic on every request despite `revalidate`, and a one-line
   import chain leaks the 1.8 MB places-client.json into the /events client bundle.
3. **The growth loop around the product is disconnected:** the beta wall 307s every
   social scraper (no link previews, zero SEO runway), robots.ts blocks the AI answer
   engines that are this product's best discovery channel, analytics has 5 events (all
   map_*), there is no email capture, and the push-notification second-session engine
   is fully built but dark (opt-in is 3 taps deep in settings).
4. **The moat is under-deployed:** the Aerial Time Machine (1958-2025 orthoimagery) has
   zero inbound links; field notes never reach the plan builder; event pages have no
   getting-there block despite parking garages + MARC + TransIT all being loaded in-repo.
5. **The design system is strong but unpropagated:** 100+ pre-deck hex literals, a
   drifted duplicate pin palette, and 1,620 ad-hoc text sizes vs 40 uses of the shipped
   type scale.

## Recommended sequence

- **Wave 1 — fix the broken promises (mostly S):** Ask env key (owner) · split save
  store · tonight hero + ended-events ranking · hide-trap · nav orphans · events bundle
  leak (one line) · stale open_status.
- **Wave 2 — launch runway (owner + S/M):** scraper passthrough on the beta wall ·
  robots.ts answer-engine split · ~10 analytics events · email capture on /beta ·
  rate-limiter/KV verification + billing alerts · push opt-in at the save moment.
- **Wave 3 — speed (M/L):** slim /map to pin fields · window /events + collapse series ·
  restore ISR (param-free server render or PPR/cacheComponents) · font consolidation ·
  LCP priority.
- **Wave 4 — the magic layer (S/M each):** time-machine deep links · field notes on plan
  stops · weather-aware planner · event getting-there block · golden-hour card ·
  cluster-tap drawer · editorial event leads.
- **Ongoing craft:** palette-migration sweep · pin colors from CATEGORY_BY_SLUG · type
  scale adoption (worst 5 files first).


## Map UX

**The dimension in one paragraph:** The single biggest opportunity is delivery, not decoration: browse /map ships a measured 3.65 MB of HTML (599 KB gzipped) on every navigation because ~1,700 decorated places are stamped into the RSC payload, while the repo's own radius mode already proves the fix — read the cacheable static places-client.json client-side, making repeat map opens near-instant on cellular. Right behind it, the pin/cluster color language quietly breaks its own promise (cluster tints only count 5 of ~20 buckets, so brewery-town clusters render generic vermilion; a dozen categories share one hex), and the map's most distinctive assets — the built isochrone API, the saved lens, the boundary polygons, walk-time math — are all one affordance away from making it feel like a hand-annotated field instrument instead of a themed Google Maps.

### [HIGH · M] Stop stamping ~1,700 places into every /map HTML response — load the cached client dataset like radius mode already does

Measured on prod: /map browse HTML is 3,647,521 bytes raw (~599 KB gzipped) because BrowseMapArea inlines OPEN_PLACES (src/app/(app)/map/page.tsx line 72, ~1,700 decorated places) into the RSC payload on every navigation — re-downloaded and re-parsed each visit, uncacheable. The precedent is already in the repo: radius mode ships ~1/10 the HTML because RadiusBuilder reads clientPlaces() from the static places-client.json (1.8 MB, but a hashed immutable asset the browser/SW caches once; it carries hours so open-status computes client-side). Browse mode can do the same — server keeps only the small layers (civic, boundaries, events, amenities) and the intent/open params; the client filters the cached dataset with the intents' match predicates. This is distinct from MAP_AUDIT owner-action #3 (bbox API / PMTiles, gated and 'do LAST'): no offline redesign needed since it's one cacheable asset. On cellular this cuts every /map open after the first to near-zero place bytes.

Files: `src/app/(app)/map/page.tsx` · `src/components/radius/RadiusBuilder.tsx` · `src/lib/loaders/places-client.ts` · `src/data/places-client.json`

### [HIGH · S] Fix the cluster dominant-color math: breweries, wineries, coffee and 15 other buckets count toward nothing

curatedGeoJson's clusterProperties (AppMap.tsx lines 1788–1794) only tallies five buckets: food, outdoors, arts, shopping, civic. bucketOf() returns 'brewery', 'wine', 'bar', 'coffee', 'bakery', 'music', 'family', 'library', 'wellness', 'lodging' etc. for huge swaths of the dataset — none of which increment any counter. An all-brewery cluster hits the mx==0 fallback and renders generic vermilion #E14328 (line 1808); a brewery-heavy downtown cluster tints as whatever minority bucket happens to exist (2 restaurants beat 10 breweries). The 'a glance tells you what an area is' promise (BUCKET_COLOR's own doc comment) is broken exactly where Frederick is most distinctive. Fix is small: map every bucket to one of 5–6 macro families in clusterProperties (drink buckets → food-family or a dedicated 'drinks' gold) so the tint is honest.

Files: `src/components/map/AppMap.tsx` · `src/components/map/categoryMarkers.ts`

### [HIGH · M] Cluster tap should answer 'what's in here' — open the existing bottom drawer with the cluster's places

Tapping a cluster today only zoom-steps (smoothFocus maxStep 2.5, AppMap.tsx ~line 816); a dense downtown cluster takes 2–3 taps to resolve, and names only appear at z15.5+ labels. The synced in-view list was deliberately removed ('the map IS the page'), so there is now NO way to see what a '47' bubble contains without fully zooming. A transient answer respects that owner call: on cluster tap, call source.getClusterLeaves() and open the already-built BottomDrawer (the Layers drawer's component) listing those places — name, category dot, open-now — each row focusing the pin/sheet. One tap turns an opaque number into a field-guide index page, then the drawer dismisses. This is the strongest 'what am I looking at' affordance available without re-adding a persistent panel.

Files: `src/components/map/AppMap.tsx` · `src/components/ui/BottomDrawer.tsx`

### [MEDIUM · S] The directions chip says '~1 min drive' for a place 300 m away — show walk minutes downtown

routeInfo (AppMap.tsx lines 1000–1009) hardcodes metersToMinutes('drive', m), so selecting a cafe two blocks from where you stand reads '0.2 mi · ~1 min drive'. The walk profile already exists in src/lib/geo (metersToMinutes('walk')), and /api/travel-time (Google Routes, cached 1h) returns real walk+drive. For a paper-map field guide of a walkable downtown, the honest default under ~1.5 km is '6 min walk' (with drive beyond that). Same fix belongs in the place sheet's distance line. One conditional, big tone shift: the map stops assuming everyone is in a car.

Files: `src/components/map/AppMap.tsx` · `src/lib/geo.ts` · `src/app/api/travel-time/route.ts`

### [MEDIUM · M] Put the existing isochrone API on the browse map: a 'within a 10-min walk of here' lens

/api/isochrone/route.ts is fully built — county-clamped, snapped to cacheable minute buckets, edge-cached 24h, falls back gracefully — but only /radius consumes it. On browse, a selected pin (or the Near-me dot) could offer 'Show 10-min walk': draw the real street-network polygon under the pins with a soft brand-tint fill and dim pins outside it. That answers the tourist's core composition question — 'I park once at Carroll Creek; what's actually reachable?' — with data no themed Google Maps shows, using an API you're already paying to cache. Entry point: one row in the place sheet or a chip next to the routeInfo directions chip; polygon renders like the existing near-ring source.

Files: `src/app/api/isochrone/route.ts` · `src/components/map/AppMap.tsx` · `src/components/place/PlaceSheetProvider.tsx`

### [MEDIUM · M] Consolidate the pin color language — 12 categories share #20506A and color is the only signal at county zoom

Pin pucks color by CATEGORY_BY_SLUG.color (categoryMarkers.ts colorOf), and categories.ts reuses hexes heavily: 12 categories share #20506A, 8 share #1E6B3A, 6 share #4A4A48, 4 share #E14328. At icon-size 0.26–0.5 (z9–13) a puck is ~12–23 px and the white glyph is illegible, so the disc color IS the read — and it collides across a dozen unrelated categories while near-identical hues (#A03A22 food vs #A02929 wellness, #B26B00 family vs #B26B00 shopping in BUCKET_COLOR) are indistinguishable at 2 px stroke. Deliberately flatten to the ~8 macro-family colors at low/mid zoom (glyphs differentiate within family at street zoom, where they're big enough), and surface those 8 swatches as a one-line legend in the Layers sheet header so the language is learnable. This is what makes the map read 'hand-organized' rather than 'randomly colorful'.

Files: `src/components/map/categoryMarkers.ts` · `src/data/categories.ts` · `src/components/map/AppMapDeck.tsx`

### [MEDIUM · M] A curated landmarks layer at county zoom — the hand-annotated field-guide read

Between the county boundary and the pin clusters, the z9–13 view is unlabeled cream: muni labels (maxzoom 13.5) are the only text, and nothing names Catoctin Mountain, Carroll Creek, Sugarloaf, Monocacy Battlefield, the covered bridges — the anchors a paper field-guide map would letter by hand. Ship a tiny static manifest (~15 entries, same pattern as AERIAL_MANIFEST) rendered as a quiet uppercase letter-spaced symbol layer with per-kind zoom ranges (ridges at z9–11, creek/battlefield at z11–14). Zero runtime cost, no API, and it is the single cheapest change that shifts the feel from 'themed Mapbox' to 'drawn for Frederick'. Tapping one can deep-link to the pages that already exist (/rivers, /trails, /history).

Files: `src/components/map/AppMap.tsx` · `src/components/map/applyFrederickPalette.ts` · `src/data/municipalities.ts`

### [MEDIUM · S] Map search navigates away when the result isn't in the current filter — resolve against the full dataset instead

pickSearch (AppMap.tsx lines 941–964) looks up place results in placesBySlug, built from the `places` prop — which browse mode pre-filters server-side by ?intent/?sub/?open. With 'Eat & drink' active, searching 'Baker Park' silently router.push()es to /places/baker-park, ejecting the user from the map they were composing. Since every curated place exists client-side in places-client.json (and doubly so after finding #1), the fix is: resolve any place result against the full slim index, clear the conflicting category filter (or add its category to activeCats), fly there, open the sheet. Search should never lose the map.

Files: `src/components/map/AppMap.tsx` · `src/lib/loaders/places-client.ts`

### [MEDIUM · S] A quiet 'you're looking at' locator line — mono coordinates + town under the camera

Orientation dies between z13.5 (muni labels' maxzoom, AppMap.tsx line 1396) and z15.5 (place-label fade-in): pan Brunswick at z14 and nothing on screen says where you are; the tap-a-town popup requires a deliberate empty-map tap. The pieces exist: pointInPolygonGeom + municipalBoundaries already resolve a point to a town, and onMoveEnd already fires per settled move. Render a small fixed chip (bottom-left, above attribution): 'BRUNSWICK · 39.4142, -77.4105' — town in Public Sans caps, coords in JetBrains Mono, exactly the 'data details' role CLAUDE.md assigns the mono face. It doubles as the hand-drawn-map compass rose: calm, informative, unmistakably a field instrument rather than a consumer map.

Files: `src/components/map/AppMap.tsx` · `src/components/map/types.ts`

### [MEDIUM · M] Event pins: up to 80 always-on DOM markers with an ungated infinite pulse

Events render as react-map-gl <Marker>s (AppMap.tsx lines 2228–2292) — up to 80 DOM nodes (page.tsx caps at 80) each running 'fr-ev-pulse 2.6s ease-out infinite' via inline style, which the prefers-reduced-motion duration-token gate in globals.css does not touch. DOM markers reposition every frame during pan (the main mobile jank source Mapbox docs warn about), they can't cluster or collision-declutter (80 pulsing photo dots swamp downtown on the 'all' time window), and there's no layer toggle to shed them. Fixes in order of value: pulse only the 3 next-starting events and gate the animation on matchMedia (the aerialFade pattern at line 388 already does this); render the rest as a symbol layer using map.addImage'd circular photo sprites so they cluster and collide like every other tier.

Files: `src/components/map/AppMap.tsx` · `src/app/globals.css` · `src/app/(app)/map/page.tsx`

### [MEDIUM · L] String the Saved lens into a walking route — 'Walk it' for date night

The saved-only lens already isolates a user's own pins, and curated collections (Date night, /collections) exist as data — but the map can only show the dots, not connect them. Add a 'Walk it' action when the saved lens (or a collection deep-link) shows 2–6 pins: order them greedy-nearest from the user's location, draw a dashed LineString (the near-route source pattern at line 2053 already renders exactly this style), and label per-leg walk minutes via metersToMinutes('walk') — upgrading later to a Mapbox Directions proxy (clone of the isochrone route) for true street paths. This converts the map from lookup to planning, which is the field-guide promise: 'here's your evening, drawn on the map.' Total-time line ('~34 min walking, 3 stops') in the directions chip slot.

Files: `src/components/map/AppMap.tsx` · `src/hooks/useFollows.ts` · `src/app/api/isochrone/route.ts`

### [LOW · S] Honest empty state when filters zero out the map

Stacking ?intent + ?sub + ?open=now can legitimately produce 0 places (e.g. a narrow sub-intent at 11 pm): the active-intent banner renders '0' (MapIntentChips.tsx activeCount) and the canvas shows bare cream with no pins and no guidance — the user can't tell a filter problem from a data problem. The design bar explicitly calls for honest empty states. When the filtered `places` array is empty in browse mode, float a small centered card: 'Nothing matches right now' + the one-tap fixes that already exist as hrefs (drop Open now via clearOpenHref, widen to the parent intent, clear all). Server-side check in BrowseMapArea (places.length === 0) so it costs nothing when populated.

Files: `src/components/map/MapIntentChips.tsx` · `src/app/(app)/map/page.tsx` · `src/components/map/AppMapDeck.tsx`


## Today UX

**The dimension in one paragraph:** The single biggest opportunity is making /today time-honest at its prime moment: the live render at 7:55 PM showed the hero with NO tonight event (while the Frederick Keys game was "Live now"), and the "What's on" rail leading with six already-ended 2-4 PM library crafts ahead of that live game — because pickFeaturedEvent lead-ranks a 72-hour pool then nulls when the winner isn't today, ingestedSeriesToCards never drops past occurrences, and compareForLead ignores the clock entirely. Meanwhile the genuinely alive content (hourly forecast on a 103° day, the food-truck roster, the "3 happy hours · 6 specials" band) sits one-to-two collapses or four scroll-screens down. The section spine is right; the page just needs its ranking and its buried live layers to know what time it is.

### [HIGH · M] Stop ranking ended afternoon events above live evening draws in What's on

At 7:55 PM the live rail's first cards after the hero slot were 2:00-4:00 PM library programs (Teen Time, Elementary Explorers, Tweens Art Printing) that had ended hours earlier, while 'Frederick Keys vs. Brooklyn Cyclones · 7:00 PM · Live now' sat ~9th. Two causes: ingestedSeriesToCards (src/lib/loaders/ingestedEvents.ts:118) filters occurrences only by upper horizon, never dropping past/ended ones (line 77 falls back ends_at=starts_at, so a 2 PM event is provably over), and compareForLead (src/lib/events/lead-rank.ts) sorts tier → imagery → soonest with no on-now/upcoming awareness. Fix: in WhatsOn (page.tsx:598-609), partition today's events into 'on now / starting soon' vs ended; lead with the live-and-upcoming set and tuck ended ones behind a quiet 'Earlier today' row (or drop them). This is the page's core promise — 'what's worth your time right now' — currently broken every evening.

Files: `src/app/(app)/today/page.tsx` · `src/lib/loaders/ingestedEvents.ts` · `src/lib/events/lead-rank.ts`

### [HIGH · S] Fix the hero's tonight teaser: pick tonight's best event, don't null when the 72h winner isn't today

TonightTeaser (page.tsx:548-569) calls pickFeaturedEvent over a 72-hour pool, then discards the result unless isEventToday — so whenever the lead-ranker's winner is a photo-backed Thursday/Friday event, the hero shows nothing tonight. Live at 7:55 PM the SkyHero carried only weather while a pro baseball game was live downtown. Same bug cascades into WhatsOn: showHero (page.tsx:606) requires the 72h winner to be today, so the section also lost its feature card and rendered as a flat tile wall. Fix: filter to today's not-yet-ended events FIRST, then pickLeadEvent on that pool for both the teaser and the WhatsOn hero; keep the 72h pick only as a 'Friday: X' fallback if you want one. One small ordering change makes the first screenful feel alive on exactly the nights it matters.

Files: `src/app/(app)/today/page.tsx` · `src/lib/events/lead-rank.ts`

### [HIGH · S] Surface the hourly forecast when weather is notable — it's double-buried today

On an Extreme Heat Warning day (98° at 8 PM, high 103°), the hourly line '12 hours · 98° → 77°' is invisible: it lives inside the collapsed 'The full briefing' (defaultOpen=false, page.tsx:407) AND inside a closed HourlyDisclosure pill — two taps deep with zero scent on the surface. The hero shows only temp-now/high/sunset. HourlySummary already produces a perfect one-liner; render it (or a slim next-6-hours strip) directly beneath the SkyHero whenever CivicAlerts has an active weather alert or weatherVerdict is rough — i.e. exactly when people ask 'when does this break?'. Self-hides on ordinary days so the calm field-guide density holds.

Files: `src/app/(app)/today/page.tsx` · `src/components/today/HourlySummary.tsx` · `src/components/today/SkyHero.tsx`

### [HIGH · S] Remove the one-tap permanent 'Hide' trap on the What's on section

DismissibleSection still renders an EyeOff 'Hide' control on the day's-events section (id='upcoming', page.tsx:613), and hiding persists in localStorage via useHiddenSections — but HiddenSectionsBar was removed from the page (page.tsx:92 comment), so there is NO restore affordance anywhere in the app. One accidental tap (it sits next to 'See all') permanently deletes the page's headline section for that device. Either drop the hide affordance from the only remaining dismissible section (simplest — the page no longer has 'too many sections'), or add an undo toast + a restore line in the section's place.

Files: `src/components/today/DismissibleSection.tsx` · `src/app/(app)/today/page.tsx` · `src/hooks/useHiddenSections.ts`

### [MEDIUM · S] Keep the rail from reading as a library bulletin board: widen routine-program detection and cap the scroller

11 of 15 tiles on the live rail were library-branch programs; 'Storytime' rows correctly sank (ROUTINE_PROGRAM matched), but 'Teen Time: Bookend Decorating (Ages 11+)', 'Elementary Explorers', 'Art Ventures', and 'Tweens (Ages 9-12) Art Printing' all rank tier 0 because the regex in src/lib/events/lead-rank.ts misses them — so recurring branch programming outranks the county's real draws. Add signals: title patterns like /\(ages? [\d-+]+\)/i, 'teen time', 'explorers', 'art ventures', or better, classify by venue ('… Library, Community Room' venues → routine tier). Also cap the horizontal shelf (currently ~14 × 280px ≈ 4,000px of scroll) at ~6 tiles with a 'See all 15 →' tail into /events — dense-but-organized, not endless.

Files: `src/lib/events/lead-rank.ts` · `src/app/(app)/today/page.tsx`

### [MEDIUM · S] Lift FoodTruckToday out of its double-nested collapse into the live layer

FoodTruckToday (the 20-truck roster door) renders inside the collapsed 'More for today' CollapsibleSection which itself sits inside the collapsed 'The full briefing' (page.tsx:514-529) — two closed accordions deep, effectively undiscoverable. A daily 'who's rolling' door is live-layer content, not archive: give it a daypart slot in OnNowBand's clusterOrder (lead it at lunch/midday, trail it evenings) or place it as a quiet row under the band. While there, dissolve the nested CollapsibleSection-inside-CollapsibleSection pattern entirely — a collapse within a collapse guarantees near-zero engagement with everything inside (PartnerAppsRow, WorthALook).

Files: `src/app/(app)/today/page.tsx` · `src/components/today/FoodTruckToday.tsx` · `src/lib/daypart.ts` · `src/components/today/OnNowBand.tsx`

### [MEDIUM · S] Make 'Plan the moment' context-aware instead of the same four static cards

CuratedPicks renders an identical evergreen rail (Walkable date night · Kid energy burners · Rainy day Frederick · Hidden gems) on every visit at every hour — and on the live heat-warning evening, 'Rainy day Frederick' appeared TWICE within two screenfuls because WeatherNudge in the masthead links the same collection. Reorder/trim the picks by moment using signals the page already computes: lead with date-night on Fri/Sat evenings, kid-burners weekend mornings, the indoor collection when weatherVerdict is rough (and then suppress WeatherNudge's duplicate link), hidden-gems as the evergreen filler. Two contextual cards + 'All collections' beats four static ones and makes the front door feel like it knows what day it is.

Files: `src/components/today/CuratedPicks.tsx` · `src/components/today/WeatherNudge.tsx` · `src/lib/weather-verdict.ts`

### [MEDIUM · S] Give evenings a jump into the On-now band, which sits four scroll-screens down at happy-hour time

At 7:55 PM, 'On now · 3 happy hours · 6 specials' rendered below the masthead, craving grid, curated rail, ~15-card events shelf, FromYourSaved, and pools — the daypart reorder in clusterOrder (src/lib/daypart.ts) only shuffles blocks WITHIN the band, never the band's page position. Without touching the owner's events-above-the-moat order, extend NowIntel (already the 'right now' line above the grid, and already linking happy hours to /happy-hour) into the daypart intelligence line: evenings add '6 specials' anchoring to #on-now (the id exists, page.tsx:345, with scroll-margin already set); mornings add 'N markets open today' from marketsOpenToday. One line, honest counts as supporting detail, and the live layer becomes one tap instead of four screens away.

Files: `src/components/today/NowIntel.tsx` · `src/lib/daypart.ts` · `src/app/(app)/today/page.tsx`

### [MEDIUM · M] Design the after-9 PM state: 'open late' lead and a first look at tomorrow

Late at night the page hollows out: the hero teaser is gone (tonight's event ended), WhatsOn falls to 'Nothing on the calendar today. Browse all events.', markets/pools/deals self-hide, and happy hours wind down — yet defaultWant() (CravingStrip) already knows it's a 'drink' hour. Two additions for the 'late' daypart: (1) an open-late answer row (bars/late kitchens open now, from the same places-client open-hours data the craving tiles use); (2) after ~9 PM, replace the empty WhatsOn state with a quiet 'Tomorrow, first look' — 2-3 lead-ranked cards for tomorrow via the same eventsPromise (eventWhenLabel already produces honest 'Tomorrow' labels). The page's own doc calls /today 'the next 24 hours'; right now the last 3 of those hours get a shrug.

Files: `src/app/(app)/today/page.tsx` · `src/components/now/CravingStrip.tsx` · `src/lib/eventWhenLabel.ts`

### [LOW · S] Consolidate the three competing weather-verdict voices in the first screenful

The live evening render stacked three separately-generated editorial takes on the same NWS hour within ~1.5 screenfuls: TodayCard's moodLine ('A hot one out there.'), WeatherNudge in the masthead ('Weather to duck. Rainy day Frederick →'), and NowIntel's weatherVerdict ('Hot out, chase shade and AC.'). Three phrase engines (moodLine in TodayCard.tsx, weather-nudge.ts, weather-verdict.ts) will inevitably drift or contradict, and repetition dilutes the calm-local-expert voice. Pick one source of truth: keep the hero's moodLine as the verdict, keep ONE actionable line below (merge WeatherNudge's collection link into NowIntel, which already links /pulse), and delete the third. Fewer, surer words is the field-guide bar.

Files: `src/components/today/TodayCard.tsx` · `src/components/today/WeatherNudge.tsx` · `src/components/today/NowIntel.tsx` · `src/lib/weather-verdict.ts`


## Events UX

**The dimension in one paragraph:** The /events page has excellent bones (horizon grouping, intent rail, honest empty states) but it is still fundamentally a feed dump wearing a field-guide coat: all 613 unified events serialize into a 1.14MB HTML document (70% inline Flight payload) to hydrate one client explorer, the hero of each horizon group is just whatever starts soonest (a library storytime can outrank the county fair), the 434-event "Coming up" bucket is padded with 4x-repeated weekly series occurrences, and there is no way to jump to NEXT weekend without scrolling that wall. The single biggest opportunity is converting the wall into a local friend's shortlist: score-picked editorial leads per horizon, collapsed recurring series, a tappable day/weekend ribbon (a built-but-orphaned component already exists), and a windowed payload so the long tail loads on demand instead of on every visit.

### [HIGH · L] Stop shipping all 613 events in the initial payload; window the long tail

Live /events measures 1,139,499 bytes of HTML, 795KB (70%) of it inline script (the RSC Flight payload), because EventsBoard passes every one of the 613 unified events into the client EventsExplorer even though first paint renders only ~50 event links (4 group leads + 5-card peeks). The 'Coming up' bucket alone holds 434 events, most beyond 14 days out and hidden behind 'Show 428 more'. slimEventForClient already fought this battle field-by-field; the structural fix is to serialize only the next ~14 days plus per-horizon counts, and fetch the 'Coming up' tail on expand via a small route handler (or a server-filtered page). Gzip is 107KB on the wire, but the decompress + parse + hydrate cost of 1.1MB on a mid-range phone is where the page feels heavy, and the cold-miss fetch took 6.0s.

Files: `src/app/(app)/events/(list)/page.tsx` · `src/components/event/EventsExplorer.tsx`

### [HIGH · M] Pick each horizon's lead card editorially, not chronologically

In EventsExplorer (line ~841, `const lead = g.events[0]`), the feature hero of every horizon group is simply the event that starts soonest, so the page's one big photo card can be a Toddler Storytime or a trivia night while the Keys game or a festival sits five rows down. This is the exact gap between 'feed dump' and 'a friend's shortlist'. Score the lead within each window using signals that already exist (eventReasons, hero_image presence, category weight, is_free, non-recurring one-offs beat weekly series) and keep chronology for the rest. A step further: a compact 'Worth planning around' strip of 3-5 scored picks for the next 7 days above the board would give the page an editorial voice with zero new data.

Files: `src/components/event/EventsExplorer.tsx` · `src/lib/event-reasons.ts`

### [HIGH · M] Collapse recurring series occurrences in the 'Coming up' wall

The serialized payload contains Preschool Storytime x4, Baby Storytime x4, Family Storytime x4, Yoga in the Taproom x4, Pour House Trivia x4, Bluegrass Jam x4, etc. — weekly series each occupying 3-4 rows of the 434-event 'Coming up' bucket, burying one-off events a local would actually plan around. Events already carry is_recurring + recurrence_text (rendered on the glance card) and a SeriesCard component exists. In the 'later' horizon, collapse a series to one row ('Pour House Trivia · Weekly on Tuesdays · next Jul 7') linking to the detail page, keeping individual occurrences only inside Today/Weekend windows where the specific date matters. This makes the wall meaningfully shorter and shrinks the payload as a side effect.

Files: `src/components/event/EventsExplorer.tsx` · `src/components/event/SeriesCard.tsx` · `src/lib/events/intents.ts`

### [HIGH · S] Add day/next-weekend navigation; the built EventWeekRibbon is orphaned

The lens enum is all/today/weekend/week, so 'what's on NEXT weekend?' — the most common planning question after 'tonight' — has no answer short of expanding the 434-row 'Coming up' bucket or leaving for the /events/calendar month grid. The explorer already supports a ?d=YYYY-MM-DD day filter (initialDay, dayKeyEastern), but grep shows the only component that emits ?d= links, EventWeekRibbon.tsx (a whole-week tappable axis with per-day density), is imported nowhere. Reinstating that ribbon (or a 14-day strip) above the board, plus a 'Next weekend' chip in the quick row, turns date navigation from scroll-archaeology into one tap and finally gives ?d= a producer.

Files: `src/components/event/EventWeekRibbon.tsx` · `src/components/event/EventsExplorer.tsx`

### [HIGH · M] Detail page's 'More upcoming' and 'Full lineup' read the 38-event static seed, ignoring the 600-event unified set

On /events/[slug], moreUpcoming pools from allUpcoming() which filters the static EVENTS array (src/lib/loaders/events.ts:392) — only ~38 hand-authored events — and lineup is `EVENTS.filter((e) => seriesKey(e) === seriesKey(event))`. For the live/ingested events that make up the overwhelming majority of the 613, 'More at {venue}' almost never finds 2+ matches, so nearly every live event page shows the same handful of seed events as 'More upcoming events', and a live weekly series (Preschool Storytime, Pour House Trivia) shows no other dates at all. Feeding both sections from assembleUnifiedEvents (the page already ISR-caches per slug) would make every detail page end with genuinely relevant next steps: the venue's real upcoming lineup and the series' real next occurrences.

Files: `src/app/(app)/events/[slug]/page.tsx` · `src/lib/loaders/events.ts` · `src/lib/loaders/unifiedEvents.ts`

### [MEDIUM · M] 'N more on the calendar' link drops every active filter

When an expanded horizon overflows its 40-card cap, EventsExplorer (line ~904) links to a bare /events/calendar — but the calendar page only understands ?m= (month), so a user who filtered to Music + Thurmont and taps '428 more on the calendar' lands on an unfiltered county-wide month grid and must start over. Either carry the view state (the ViewState -> query codec in lib/view-state already exists) and teach the calendar loader to honor intent/town/free, or keep the user in the explorer with an in-place 'show next 40' pagination instead of exporting them to a different surface. The current handoff is the one place the otherwise-careful URL-state plumbing silently loses the user's work.

Files: `src/components/event/EventsExplorer.tsx` · `src/app/(app)/events/(list)/calendar/page.tsx` · `src/lib/loaders/calendar.ts`

### [MEDIUM · M] Surface anonymous save counts as quiet social proof on event pages

Saves are localStorage-only, so an event page gives zero signal that anyone else in the county cares — yet a device-keyed saved_events table already exists in Supabase (src/app/api/saved/route.ts, used for push reminders). Aggregate counts per slug and render a thresholded, calm line on the detail page and the feature card ('12 locals have this saved' only when N >= 3, mono type, supporting-detail placement per the design system). This is the cheapest 'alive' signal available: it requires no new write path for push-subscribed users, and extending the SaveButton to POST the slug (no endpoint) for non-push devices is a small delta. It also gives the editorial-lead scoring (finding 2) a real popularity input over time.

Files: `src/app/api/saved/route.ts` · `src/components/saved/SaveButton.tsx` · `src/app/(app)/events/[slug]/page.tsx` · `src/lib/db/schema.ts`

### [MEDIUM · S] Promote the Town filter out of the buried Filters sheet

Town is the most local-friend axis there is ('what's on in Brunswick this weekend'), and the masthead even advertises '613 events · 9 towns' — but selecting a town requires opening the Filters bottom sheet and scanning a pill wall, while the always-visible quick row spends its five slots on daypart/today/weekend/free/happy-hour. Add a compact town selector to the visible control row (a single dropdown pill like SortDropdown, or a second scrollable chip row under the intent rail), keeping the sheet for the long tail. The state wiring is done (town is already in ViewState and shareable); this is purely discoverability of an existing power.

Files: `src/components/event/EventsExplorer.tsx`

### [LOW · S] Happy-hour filter silently misses events after description truncation

slimEventForClient in the events page caps description at 160 characters before events reach the client, but the happyOnly predicate in EventsExplorer (line ~254) regex-tests `${e.title} ${e.venue_name} ${e.description}` — so an event whose only 'happy hour' mention sits past character 160 of its description silently fails the filter on /events while matching anywhere the full record is read. Fix at the boundary per the pipeline rule: compute a boolean (or reuse an existing tag) server-side during assembly and ship a 1-byte flag instead of regexing truncated prose client-side; this also makes the chip's results stable if the truncation length ever changes.

Files: `src/app/(app)/events/(list)/page.tsx` · `src/components/event/EventsExplorer.tsx` · `src/lib/loaders/unifiedEvents.ts`


## Places & the save loop

**The dimension in one paragraph:** The single biggest opportunity is that the save loop is plumbed through two stores that don't agree: signed-in saves go to the DB (useFollows) while the Saved tab reads only localStorage (useSavedList), so the app's core promise — save it and find it under Saved, on any device — silently fails for exactly the users who signed in to get it, and the place page's primary Save CTA compounds this by bouncing anonymous users to a login wall the sheet's identical button doesn't have. Fix the pipe first (one save path, one read path), then make saving lead somewhere: the ingredients for "saved 20 places → planned my Saturday" all exist (personal lists, plan tokens, share links, been-here) but aren't connected — lists can't be planned or shared, visited state marks nothing, and the sheet can't organize a save at all. On the place page itself, the three visitor questions (open? good? how far?) are answered below eight modules of chrome and the rating never renders, while the verified Field Notes moat covers ~5% of places and renders its happy-hour data as static text instead of a live "happy hour now" answer.

### [HIGH · M] Fix the split save store: /my-radius never shows DB follows for signed-in users

SavedList (the entire body of /my-radius) reads useSavedList() from src/hooks/useSaved.ts, which is localStorage-only. But when a user is signed in, useToggleFollow (src/hooks/useFollows.ts:251-292) writes ONLY to the remote store via /api/follows and never touches localStorage. So a signed-in user who taps Save on a place page sees the toast, then opens the Saved tab and the place is not there; a second device shows nothing at all. The comment at src/app/(app)/my-radius/page.tsx:26-28 claims SavedList renders 'DB (via useFollows) when signed in' — it does not. Meanwhile AppMap, PlanBuilder, and Today's FromYourSaved all correctly use useFollowedSlugs, so the map shows a saved pin the Saved tab denies exists. Fix: SavedList's place items should come from useFollowedSlugs() (merged with saved_at metadata from /api/follows), same as every other consumer.

Files: `src/components/saved/SavedList.tsx` · `src/hooks/useFollows.ts` · `src/app/(app)/my-radius/page.tsx`

### [HIGH · S] Remove the login wall from the place page's primary Save CTA

MyRadiusButton (src/components/place/MyRadiusButton.tsx:87-97) checks /api/auth/me on tap and, for anonymous users, navigates AWAY to /auth/login?next=... instead of saving. The identical action in PlaceSheet (SaveButton) saves silently to localStorage. So the most prominent save button in the app punishes the tap with a full-page auth detour, while the icon version rewards it — the save loop's front door is its highest-friction point. Fix: always save locally and optimistically (one code path with SaveButton), then upsell sync in the toast ('Saved on this device · Sign in to sync'), which also removes the extra /api/auth/me round trip on every tap.

Files: `src/components/place/MyRadiusButton.tsx` · `src/components/saved/SaveButton.tsx`

### [HIGH · M] Put the three answers (open? good? how far?) directly under the place title

On /places/[slug] the OpenClosedDot + price row sits at the BOTTOM of the hero card (page.tsx:329-340), below the description, KnownForCard, amenity strips, audience tags, Field Notes, PlaceNoteCard, PlaceListsCard, and the review quote; the HoursBlock is ~10 modules further down (line 424) and the directions grid is below the closure banners. The page also never renders google_rating at all — the PlaceSheet shows '★ 4.6 (1,234)' (PlaceSheet.tsx:374-381) but the full page, the canonical SEO surface, answers 'is it good' only with a blockquote. Fix: one status line under the H1 — 'Open till 9 · $$ · ★ 4.6 (1,234) · 8 min drive' (travel time API already exists for the sheet) — with the directions pair adjacent. Everything a first-time visitor needs before scrolling; typography-first, no new boxes.

Files: `src/app/(app)/places/[slug]/page.tsx` · `src/components/place/OpenClosedDot.tsx` · `src/components/place/HoursBlock.tsx`

### [HIGH · S] Demote the 'Your notes' + 'Your lists' input cards out of the hero for first-time visitors

PlaceNoteCard and PlaceListsCard render unconditionally inside the hero card (page.tsx:312-315) as two full bordered sections with text inputs, six suggestion chips, and 'Saved on this device' footers — even when the user has never saved, noted, or listed anything. For the 95% first-visit case this is ~300px of personal-input chrome sitting between the place's identity and its open/closed status, and it reads as app furniture, not a field guide. Fix: when both are empty, collapse them to one quiet inline affordance ('Add a note or list +') below the action grid; expand in place on tap. Existing notes/lists keep rendering as they do now.

Files: `src/components/place/PlaceNoteCard.tsx` · `src/components/place/PlaceListsCard.tsx` · `src/app/(app)/places/[slug]/page.tsx`

### [HIGH · M] Make personal lists lead to plans: per-list actions on /my-radius

The list filter on /my-radius (SavedList.tsx:643-656) only filters the Places section. The 'Plan a day' CTA fires solely on a ≥3-saves-in-one-town cluster with a hardcoded audience/vibe (planTokenFromSaved, SavedList.tsx:59-68, 482-486), and the Share button (line 615) always shares ALL saved places, ignoring the active list — sharing your 'date night' list actually ships your whole radius. This is exactly the missing bridge between 'saved 20 places' and 'planned my Saturday'. Fix: when a list chip is active, the share URL and plan token should encode that list's slugs (and map view should show just them); add a small 'Plan this list →' row under the filter chips. All plumbing (plan tokens, /radius/shared, map view) already exists.

Files: `src/components/saved/SavedList.tsx` · `src/lib/integrations/planner.ts`

### [HIGH · L] Make Field Notes time-aware and give the moat a growth valve

Field Notes cover 85 of 1,634 client places (~5%, src/data/field-notes.json), and where they exist the happy-hour note is static text ('Mon-Fri 4-6pm') rendered identically at 5pm Tuesday and 9am Sunday (FieldNotesCard.tsx:83-88). The app already computes open_status at request time, so it can compute 'Happy hour now, until 6' and surface it in the place's status row and on PlaceCard — turning the moat from a footnote into a live answer (NORTH_STAR law: answer the question). Second, there is no contribution path: the only valves are 'Report incorrect info' mailto and 'Tell us'. A one-tap 'Know an insider tip?' prompt on covered-adjacent categories (restaurants/bars without notes) that queues to the verification pipeline would grow coverage where it matters most.

Files: `src/components/place/FieldNotesCard.tsx` · `src/lib/loaders/fieldNotes.ts` · `src/data/field-notes.json` · `src/components/place/PlaceSheet.tsx`

### [MEDIUM · M] Close the save→organize gap in the PlaceSheet

The map/sheet is the primary browse surface, but PlaceSheet offers only the bookmark icon (PlaceSheet.tsx:298-300) — no lists, no note, no been-here. Organizing a save requires navigating to the full page and scrolling into the hero card, so most saves stay an undifferentiated pile (which is why the /my-radius list filter rarely has anything to filter). Fix: after a save in the sheet, extend the existing Sonner toast with an 'Add to a list' action that opens a 3-chip picker (the user's existing lists + one suggestion), writing through the same useSavedTags store. One tap from save to organized, no new surface.

Files: `src/components/saved/SaveButton.tsx` · `src/components/place/PlaceSheet.tsx` · `src/hooks/useSavedTags.ts`

### [MEDIUM · S] Make 'Been here' visible outside its own section

BeenHereToggle exists only on the place detail page (demoted below the action grid, page.tsx:370-372) and its only payoff is a flat 'Visited' card list on /my-radius (SavedList.tsx:901-927) that duplicates the same PlaceCards shown in Places above it. The state never marks the card itself, never appears in the sheet, and never feeds the summary sentence. Fix: a small check glyph on PlaceCard for visited places (so browsing shows 'you know this one'), fold the count into the 'At a glance' sentence ('12 places, 4 visited, across 3 towns'), and replace the duplicate Visited card list with that framing. Turns a dead-end toggle into a field-guide 'logged specimen' mark.

Files: `src/components/place/BeenHereToggle.tsx` · `src/components/place/PlaceCard.tsx` · `src/components/saved/SavedList.tsx`

### [MEDIUM · S] Cross-link collections from place pages ('Appears in Walkable date night')

Six editorial collections exist (src/data/collections.ts) and are surfaced on /today and /collections, but a place page never says which collections it belongs to — the editorial layer is invisible exactly where a visitor is deciding. A build-time reverse index (place slug → collection slugs) rendered as one quiet line in the footer or under KnownForCard ('In the guide: Walkable date night · Rainy day Frederick') gives every collection member a doorway into the curated layer and gives the page third-party-style validation ('the guide vouches for this'). Also worth gating: the lgbtq-frederick collection currently renders publicly with a single place, which undercuts the curated-confidence framing until more venues are verified.

Files: `src/data/collections.ts` · `src/app/(app)/places/[slug]/page.tsx` · `src/app/(app)/collections/[slug]/page.tsx`

### [MEDIUM · M] Stop overpromising sync: notes, lists, and been-here are device-only even when signed in

The /my-radius sign-in strip says 'Sync across devices' (page.tsx:83-88), but only place follows sync — useNotes, useSavedTags, and useBeenHere are explicitly per-device v1 (comments in each hook cite 'DB sync can layer on later'). A user who writes ten margin notes, signs in expecting sync, and opens a new phone loses all of them silently — the worst outcome for the exact users who invested most in the loop. Either extend /api/follows-style sync to the three small key-value stores (they share the same useSyncExternalStore pattern, so a generic synced-KV endpoint covers all three), or scope the CTA copy to 'Sync your saved places' until it's true. Honesty is cheap; the sync is an M.

Files: `src/hooks/useNotes.ts` · `src/hooks/useSavedTags.ts` · `src/hooks/useBeenHere.ts` · `src/app/(app)/my-radius/page.tsx`


## Navigation, IA & onboarding

**The dimension in one paragraph:** The IA has consolidated into one strong hub (/today leads a clean 4-tab nav; /guide, /find, /now, /weekend were all correctly folded in via 308s) - but the pruning left the hub's own spokes disconnected: the single biggest opportunity is that the front door's 'I want...' fast lane dumps users into nav-orphaned routes (/nearby, /brunch, /happy-hour light no tab and swap the wordmark for a Back button, because tabs.ts SECTION_PREFIXES only covers /places//category//collections//m/), while several polished destinations (/places directory, /plan builder, /parks, the /search results page) lost their last doors during aggressive Today-page cuts and now survive only as accordion sub-tiles or breadcrumbs. The second-session story has the same shape: the save-to-push reminder machinery is fully built but unreachable, since push opt-in exists only three taps deep at /settings/notifications - wiring it to the first event save is the highest-leverage retention change available.

### [HIGH · S] Stop orphaning the nav on the front door's own fast lane (/nearby, /open-now, /brunch, /happy-hour...)

Tapping any 'I want...' tile on /today (Coffee -> /nearby?c=coffee, Brunch -> /brunch, Happy hour -> /happy-hour, Trails -> /trails, Parking -> /parking) lands on a route where tabIndexForPath() returns -1: the BottomNav/SideRail brand pill vanishes and TopBar swaps the wordmark for a Back button, so the app's most-trafficked flow immediately reads as 'you left the app's structure.' SECTION_PREFIXES in tabs.ts only maps /places, /category, /collections, /m/ (all to Map) - so /category/pizza lights the Map tab while the sibling /nearby?c=coffee lights nothing, an arbitrary inconsistency. Add the craving/live destinations (/nearby, /open-now, /brunch, /happy-hour, and arguably /trails, /rivers, /parking, /transit, /deals, /live-music) to SECTION_PREFIXES under Today (index 0) since they are extensions of Today's fast lane. One array edit fixes both navs and the TopBar simultaneously.

Files: `src/components/nav/tabs.ts` · `src/data/wants.ts` · `src/components/nav/TopBar.tsx`

### [HIGH · M] Offer push opt-in at the moment of saving an event - the second-session engine exists but is dark

The return-visit infrastructure is fully built: SaveButton.syncSavedEventReminder mirrors event saves into a server registry for the 'one hour before' cron, useFollows syncs follow topics, and parking-alert crons push url:/parking. But syncSavedEventReminder silently no-ops when pushManager.getSubscription() is null, and the ONLY surface that creates a subscription is /settings/notifications - three taps deep behind Explore sheet -> Settings -> Notifications, a path no beta user will find. So the strongest 'what brings someone back tomorrow' loop never activates. Add a one-time, dismissible inline row (calm field-guide voice, not a browser-prompt ambush) right after a user's FIRST event save: 'Want a nudge an hour before this starts?' -> triggers subscription -> retro-syncs existing saves. This converts the already-shipped save action into tomorrow's session.

Files: `src/components/saved/SaveButton.tsx` · `src/components/settings/NotificationsCard.tsx` · `src/app/api/push/subscribe/route.ts` · `src/lib/push-topics.ts`

### [MEDIUM · S] Bridge SearchOverlay to the orphaned /search results page with a 'See all results' row

SearchOverlay (the real search UX, opened from every TopBar) fetches /api/search?limit=12 and never links to /search - and Enter opens the highlighted hit via window.location.href (a full document reload, defeating the client router and view transitions). Meanwhile the polished single-ranked-list /search page is reachable in-app only from itself (SearchInput is mounted solely on /search/page.tsx) and one link on /places. A query with 30 matches dead-ends at 12 with no escape. Add a final overlay row 'See all results for {q}' -> /search?q=..., make Enter-with-no-selection go there too, and use router.push instead of window.location.href. Small change, closes the app's only search dead-end.

Files: `src/components/search/SearchOverlay.tsx` · `src/app/(app)/search/page.tsx` · `src/components/search/SearchInput.tsx`

### [MEDIUM · S] Make the Explore sheet the complete index it claims to be: add /places, /plan, /parks

MoreSheet's subtitle says 'Every page, tool, and way to help' and its comment claims 'nothing is reachable only by typing a URL,' but three substantial surfaces are missing: /places (the directory index whose own doc-comment says 'a stranger can land here and see the breadth of the 1,700+ places' - actually reachable only via a place-detail breadcrumb, an AppMap fallback link, and /styleguide), /plan (the itinerary builder), and /parks (whose only inbound link is one deep link on /pulse; wants.ts sends the 'Parks' tile to /nearby?c=outside instead). The sheet's rationale - 'craving destinations live on Today' - holds for wants.ts entries but these three are not in wants (or are buried, see /plan finding). Add 'All places', 'Plan an evening', and 'Parks' tiles to the Discover cluster; they fit the existing 3-column icon-tile grid with zero new patterns.

Files: `src/components/nav/MoreSheet.tsx` · `src/app/(app)/places/page.tsx` · `src/app/(app)/parks/page.tsx` · `src/app/(app)/plan/page.tsx`

### [MEDIUM · M] Give /plan a temporal door on Today - the flagship builder is one accordion sub-tile deep

The 'Plan an evening' itinerary builder (a signature, heavily-designed surface: vibe cards, presets, shareable plan specs) has exactly two live entry points: the 'Plan a day' sub-item under the 'See & do' accordion in WantsAccordion (which is collapsed unless the user expands that category - the default-open category is eat/drink/outdoors by daypart, never seedo) and the plan-from-saves link in SavedList. Every CTA built for it is dead code that no page imports: FloatingPlanFab, ModeAwareCta, PrimaryActionCard all reference /plan but are mounted nowhere. A daypart-aware door fits the existing OnNowBand pattern: on Thu-Sat after ~4pm, one quiet row in the On Now band ('No plan tonight? Build one from real places'). That is when the intent exists, it self-hides otherwise, and it respects the one-primary-action rule.

Files: `src/app/(app)/plan/page.tsx` · `src/components/now/WantsAccordion.tsx` · `src/components/today/OnNowBand.tsx` · `src/components/today/FloatingPlanFab.tsx`

### [MEDIUM · M] Reconcile the three competing first-run mechanisms; /welcome is orphaned with stale claims

First-run currently means: BetaIntroCard (live slim strip on /today), FirstVisitNote (live one-time standfirst), and WelcomeFlow at /welcome - which middleware no longer redirects to ('Onboarding redirect was REMOVED in the pre-launch pass') yet whose comments still claim 'middleware won't bounce the user back here' and whose fr_onboarded cookie is written but read by nothing. The only path to /welcome is Settings -> reset (PreferencesPanel:135). So a two-step persona/mood flow that seeds MoodTiles bias and resident/visitor mode is unreachable for the users it was built for. Decide once: either delete /welcome + fr_onboarded + WelcomeFlow (and their robots/sitemap exclusions), or make BetaIntroCard's action 'Tune it for you - 2 taps' -> /welcome instead of pointing new users at the /about essay. Either resolution beats the current half-alive state.

Files: `src/components/welcome/WelcomeFlow.tsx` · `src/app/welcome/page.tsx` · `src/components/today/BetaIntroCard.tsx` · `src/middleware.ts` · `src/components/settings/PreferencesPanel.tsx`

### [LOW · S] Restore the promised /history -> /markers cross-link (its documented lifeline does not exist)

src/app/(app)/markers/page.tsx documents itself as 'Orphan-by-design... reachable by URL + the More sheet + a cross-link from /history' - but the More sheet dropped it in the v7 rewrite and /history/page.tsx contains no reference to /markers at all (grep confirms zero href="/markers" anywhere in tsx). Its sole entry is the 'Markers & landmarks' sub-item inside the collapsed 'See & do' accordion. This is real, differentiated content (every MDOT roadside marker inscription + National Register sites) that a History reader is the exact audience for. Add the cross-link card on /history and update the markers page comment to match reality.

Files: `src/app/(app)/history/page.tsx` · `src/app/(app)/markers/page.tsx`

### [LOW · S] Delete the dead nav-adjacent component graveyard in src/components/today

Eight components are imported by no page: FloatingPlanFab, ModeAwareCta, PrimaryActionCard, TodayActions, TodayTabs, LivePulse, TuneForYou, and AdaptiveGreeting (plus HomeMuniChip, used only by AdaptiveGreeting). Several carry doc-comments describing live behavior ('Lives in TopBar...', links into /pulse?open=...), which actively misleads anyone auditing navigation - this review had to grep-verify each one. /today/page.tsx already keeps an 'archeology' log of removals in comments; the components themselves should follow. Zero user-facing change, but it makes every future IA pass (human or agent) faster and prevents a half-informed 'reconnect this orphan CTA' regression.

Files: `src/components/today/FloatingPlanFab.tsx` · `src/components/today/ModeAwareCta.tsx` · `src/components/today/PrimaryActionCard.tsx` · `src/components/today/TodayTabs.tsx` · `src/components/today/LivePulse.tsx` · `src/components/today/TuneForYou.tsx`

### [LOW · S] Fix CLAUDE.md's stale nav spec: the shipped nav is 4 tabs, Ask(/guide) no longer exists

CLAUDE.md's 'Locked architecture' section states the nav is 'Ask(/guide) - Today - Map - Events - Saved' from tabs.ts, but tabs.ts ships exactly four tabs (Today/Map/Events/Saved) and /guide 308-redirects to /today (next.config.ts, PR #624 per the tabs.ts comment). Because CLAUDE.md overrides default agent behavior by design, every future agent session starts with a false ground truth about the app's primary navigation - this very review was briefed on a five-tab nav with Ask at position #1. Update the locked-architecture bullet to the four-tab reality and note the /guide retirement, so the 'locked' spec locks the thing that actually shipped.

Files: `CLAUDE.md` · `src/components/nav/tabs.ts` · `next.config.ts`


## Performance & Vercel

**The dimension in one paragraph:** The single biggest opportunity is the /map data-transport model: src/app/(app)/map/page.tsx serializes 1,627 fully-decorated place records into every response (measured live: 3.65MB HTML, 3.58MB of it one RSC flight script, ~596KB brotli on the wire) while ALSO being forced fully dynamic by its searchParams read (live headers: private/no-store, x-vercel-cache MISS, 0.6-0.9s TTFB) — so every Map tab visit past the 30s client-cache window re-pays both the download and a full serverless render. Slimming the payload to pin-level fields, hydrating detail data from the already-existing lazy places-client chunk, and restoring ISR (or PPR) for /map and /events would turn the app's two heaviest surfaces from multi-second dynamic renders into ~100ms CDN hits, with a companion one-line fix (EventCard's value import of eventDateBlock dragging the 1.8MB places-client.json into /events' client bundle) as the highest ROI single change in the repo.

### [HIGH · M] Stop shipping 1,627 full place records in every /map HTML response

Measured live: /map HTML is 3.65MB, and 3.58MB of it is ONE inline __next_f flight script containing 1,627 place records at ~2.2KB each (each with address, phone, website, blurb, license, provenance dates, plus 11,477 '$undefined' tokens ≈ 138KB of waste). The source is src/app/(app)/map/page.tsx: module-scope OPEN_PLACES = publicPlaces().map(decoratePlace) passed as the `places` prop to AppMapClient. The map pins only need slug/name/category/geom/open_status/feature_score (~200B each ≈ 0.35MB raw / ~50KB br); the drawer's PlaceCard details can hydrate from the lazy places-client chunk the radius branch ALREADY uses (useClientPlaces dynamic import, cached immutably under /_next/static and by the SW), or via the existing /api/places/by-slugs route. Wire cost drops ~596KB→~80KB br per map visit, and low-end phones stop parsing a 3.5MB string on the main thread (hundreds of ms of INP/TBT). This also multiplies with staleTimes.dynamic:30 — today every return to the Map tab after 30s re-downloads the full 596KB flight.

Files: `src/app/(app)/map/page.tsx` · `src/components/map/AppMapClient.tsx` · `src/hooks/useClientPlaces.ts` · `src/app/api/places/by-slugs/route.ts`

### [HIGH · S] Cut places-client.json (1.8MB / 251KB br) out of the /events client bundle — one-line import chain fix

Live /events loads chunk 05al9l449upt5.js (1.81MB raw, 251KB compressed) as an initial <script async> — I fetched it and it is JSON.parse of the entire places-client dataset. The chain: EventCard.tsx line 7 imports the VALUE eventDateBlock from @/lib/loaders/events, and loaders/events.ts line 7 statically imports clientPlaceBySlug from @/lib/loaders/places-client. This is exactly the '12MB bundle leak' pattern AppMap.tsx documents guarding against with TYPE-ONLY imports. Moving eventDateBlock (line 444, a pure date formatter) into a data-free module drops /events first-load JS from 774KB to ~520KB compressed and removes ~1.8MB of JSON parse. Every surface rendering EventCard client-side benefits. Add an eslint no-restricted-imports rule for lib/loaders/places-client from client components so it can't regress.

Files: `src/components/event/EventCard.tsx` · `src/lib/loaders/events.ts` · `src/lib/loaders/places-client.ts`

### [HIGH · L] /map and /events render fully dynamic on every request despite revalidate — restore ISR or adopt PPR/cacheComponents

Both pages export revalidate (300/600) but live headers show 'private, no-cache, no-store' and x-vercel-cache: MISS with 0.6–0.9s TTFB, because awaiting searchParams anywhere makes the whole Next 16 route dynamic — so every visit pays a fresh serverless render fanning out to the ~10 timeout-guarded feeds. Meanwhile /today and /places/[slug] correctly serve HIT. Two paths: (a) enable Next 16 cacheComponents/PPR so the shell + feed-derived layers prerender and only the searchParam-dependent filter state renders per request; or (b) since MapIntentChips/MapTimeChips/EventsExplorer already keep filter state in the URL via nuqs, move filter APPLICATION client-side (the data is all client-visible anyway) and render the server page param-free, making both routes true ISR entries with CDN HITs (~100ms TTFB). Combined with slimming the map payload this makes tab switches feel instant instead of multi-second.

Files: `src/app/(app)/map/page.tsx` · `src/app/(app)/events/(list)/page.tsx` · `next.config.ts`

### [HIGH · S] Fix stale open_status: OPEN_PLACES is decorated once per lambda instance, not per request

src/app/(app)/map/page.tsx line 72 computes OPEN_PLACES at MODULE scope; decoratePlace defaults now = new Date() evaluated at module init. A warm serverless instance serves hours-old open_status — the '?open=now' filter, openNowCount chip, and 'closing soon' badges on /map are computed from that frozen clock (I confirmed open_status with closesAt values baked into the flight payload). It also runs 1,627 decoratePlace calls on every cold start, inflating cold TTFB. Compute per-request (cheap once the payload is slimmed to pin fields) or wrap in unstable_cache keyed on a 5-minute time bucket like cachedUpcomingEvents already does in the same file.

Files: `src/app/(app)/map/page.tsx` · `src/lib/loaders/places.ts`

### [MEDIUM · M] Window the /events payload: 613 events double-serialized into 1.14MB

Live /events is 1.14MB: 790KB RSC flight + 340KB markup. slimEventForClient already caps descriptions at 160 chars, but all 613 publicEvents still cross into EventsExplorer (~1.3KB each), plus civic/reminder lanes, while the page visibly renders ~100 cards. Serialize only the browsable horizon (e.g. next 30 days or first ~250 by start time — matching the civicSeries windowing pattern already applied at line 287) and fetch the long tail from a cached route handler when the user scrolls past it or searches. With finding 3 this takes /events from ~1.9MB of HTML+data-JS to roughly 500KB, directly improving LCP and scroll INP on the second-most-visited tab.

Files: `src/app/(app)/events/(list)/page.tsx` · `src/components/event/EventsExplorer.tsx`

### [MEDIUM · S] No LCP image gets priority — every next/image on /today, /map, /events is loading=lazy

Grepping the live HTML of all three routes finds zero fetchpriority="high" and every <img> carries loading="lazy" decoding="async", including above-the-fold hero/card thumbnails on /today and the first EventCard images on /events. When the LCP element is a photo (the 'Plan the moment' rail, event heroes), lazy-loading it adds a full request-waterfall delay after hydration. Add priority (which sets fetchpriority=high + eager) to exactly the first visible image per route — the AVIF pipeline and blob-CDN preconnect in layout.tsx are already in place, so this is the last missing link. Typical win is 200–500ms of LCP on photo-led folds.

Files: `src/components/event/EventCard.tsx` · `src/components/place/PlaceCard.tsx` · `src/app/(app)/today/page.tsx`

### [MEDIUM · S] Bound the service worker caches — navigations (incl. 3.6MB /map HTML) and images accumulate without limit

src/app/sw.js/route.ts: the navigate handler caches every successful navigation response into STATIC_CACHE and isImage caches every photo into IMAGE_CACHE, with no entry cap, no expiry, and no size guard until a deploy rotates CACHE_VERSION. A browsing session stores each 3.6MB /map document variant (every ?intent=/?t= URL is a distinct cache key) plus hundreds of place photos. On iOS Safari, hitting the origin quota triggers whole-origin eviction — which deletes the offline shell the install handler set up, silently breaking the PWA's offline promise. Add a simple trim-after-put (e.g. keep last 25 navigations, 150 images) — ~15 lines in the same template string.

Files: `src/app/sw.js/route.ts`

### [MEDIUM · S] Collapse 15 static font files to 3 variable fonts

src/app/layout.tsx requests Inter at 4 weights, Fraunces at 4 weights x 2 styles (8 files), and JetBrains Mono at 3 weights — 15 latin-subset woff2 files, of which only 4 are preloaded (verified in live HTML), so the remaining 11 arrive late and can flash weight changes mid-scroll on a serif-heavy, typography-first design. Inter, Fraunces, and JetBrains Mono are all variable fonts: dropping the weight arrays (next/font then serves the variable file) yields one file per family (+1 for Fraunces italic), all preloaded, fewer requests and roughly comparable-or-smaller total bytes with every intermediate weight available free. Cleanest font waterfall the platform offers.

Files: `src/app/layout.tsx`

### [MEDIUM · M] Trim Sentry's weight in the every-page framework chunk

The largest shared chunk on every route (07z0p~nuy8by2.js, 131KB compressed / 415KB raw) contains react-dom plus 111 Sentry references — @sentry/nextjs with tracesSampleRate: 0.1 in instrumentation-client.ts pulls the full browser tracing machinery into first-load JS for every visitor, though the config comment says 'minimum viable... unhandled client errors only.' Either drop client-side tracesSampleRate (server traces continue unaffected) and enable the SDK's treeshaking flags (__SENTRY_TRACING__: false via webpack/turbopack define, excludeTracing in withSentryConfig), or move to Sentry's lazy loader. Realistic saving is 30–60KB compressed off EVERY page's critical path — bigger than most route-level optimizations left.

Files: `src/instrumentation-client.ts` · `next.config.ts`

### [MEDIUM · M] Cache the /map feed fan-out as data, not just per-fetch

BrowseMapArea awaits 11 upstream feeds per render (Chart, FixIt, Mapillary, trails, transit, boundaries, county, USGS, field amenities, community reports, events). Each fetch has next.revalidate so upstream HTTP is cached, but because the route is fully dynamic (finding 3), every request still pays deserialize + dedupeAmenities over 1,627 places + GeoJSON reshaping, and a fetch-cache MISS on any one feed (e.g. mdot-chart at revalidate:120) re-blocks the stream up to its 6s timeout. cachedUpcomingEvents (map-upcoming-events-v1, SHA-pinned, 300s bucket) is the right pattern — extend it to a single cachedMapLayers() wrapping the whole Promise.all so the assembled layer set is computed once per 300s instead of per visitor. Cuts the p50 streamed-map delay and eliminates the 6s p99 stalls.

Files: `src/app/(app)/map/page.tsx` · `src/lib/integrations/mdot-chart.ts` · `src/lib/loaders/amenities.ts`


## Platform & data (Supabase, caching)

**The dimension in one paragraph:** The single biggest opportunity: the map's event pins come from a second, already-drifted assembly pipeline instead of THE unified event set. src/app/(app)/map/page.tsx builds its own loadUpcomingEvents (its own unstable_cache key "map-upcoming-events-v1") that omits SeatGeek, Eventbrite, Visit Frederick, Frederick Keys, Squarespace venue lineups, and the ingested FCPL/FCVFRA series — and calls fetchBandsintownForArtists([]) with an empty artist list, so Bandsintown contributes nothing to the map at all. This violates the spirit of the CLAUDE.md "one unified event set" rule (an event visible on /events can be missing from /map pins), skips the Keys dedupe and time-sanity guards, and pays a second multi-feed fetch plus a second cache the warm-events cron must keep hot. Consuming assembleUnifiedEvents and filtering for geo-precise public events would make the map show everything the app knows, cut server fetch cost, and eliminate a whole drift class.

### [HIGH · M] Unify /map's parallel event assembly onto assembleUnifiedEvents

src/app/(app)/map/page.tsx lines 207-252 maintain a second event pipeline (loadUpcomingEvents + unstable_cache "map-upcoming-events-v1") that fetches getCachedLiveEvents + Ticketmaster music/sports directly and calls fetchBandsintownForArtists([]) with an EMPTY array — so Bandsintown, SeatGeek, Eventbrite, Visit Frederick, Frederick Keys, Squarespace venue lineups, and ingested FCPL/FCVFRA events never become map pins, and the Keys day-dedupe + hasImplausibleStartTime guards in unifiedEvents.ts don't apply. CLAUDE.md's own rule is "never count events from a different query" — this is the same soft-drift bug (June-9 P0-5) reborn on /map. Replace loadUpcomingEvents with assembleUnifiedEvents(now) filtered by isGeoPrecise/!isCivicEvent; the warm-events cron already keeps that exact cache hot, so /map gets richer pins AND a warmer cache for free while one whole multi-feed fetch path and cache key disappear.

Files: `src/app/(app)/map/page.tsx` · `src/lib/loaders/unifiedEvents.ts` · `src/app/api/cron/warm-events/route.ts`

### [HIGH · M] Make the community-reports layer feel live: revalidate /map on publish and poll /api/reports client-side

Community reports are baked into /map's ISR HTML (page-level revalidate=300 via getCommunityReports in map/page.tsx line 481), and neither write path busts it: /api/reports POST (trusted instant-publish, src/app/api/reports/route.ts) revalidates nothing, and the admin approve action only calls revalidatePath("/admin/reports") (src/app/admin/reports/actions.ts line 34). A resident who reports "parking full" won't see their own pin — nor will anyone else — for up to 5 minutes, exactly the window an ephemeral condition report matters most. Cheap fix: revalidatePath("/map") on approved insert + admin approval, plus have AppMapClient fetch the already-existing no-store GET /api/reports on mount/visibilitychange and merge fresh pins over the SSR set (optimistically adding the submitter's own). A Supabase Realtime channel on community_reports (with a narrow RLS select policy for status='approved') is the full "alive" version, but the polling overlay gets 90% of it in an afternoon.

Files: `src/app/api/reports/route.ts` · `src/app/admin/reports/actions.ts` · `src/app/(app)/map/page.tsx` · `src/lib/loaders/communityReports.ts`

### [HIGH · M] Build the read side of business_updates — the publish loop writes to a rail that doesn't exist

POST /api/business/updates (src/app/api/business/updates/route.ts) persists owner/admin updates and fans out push, and the schema comment (src/lib/db/schema.ts lines 531-541) promises "PlaceDetail and /my-radius will render published updates" — but no GET endpoint or loader reads business_updates anywhere; the only SELECT is the route's own 12-hour rate-limit check. Every published update is visible solely as a one-shot push notification; a follower who missed the push, or anyone visiting the place page, sees nothing. Add a small cached loader (published, non-expired, by place_slug) rendered as a quiet "From the owner" note on /places/[slug] and a "Updates from places you follow" row on /my-radius — this is what makes claiming a business worth doing and makes the guide read as current rather than archival.

Files: `src/app/api/business/updates/route.ts` · `src/lib/db/schema.ts` · `src/app/(app)/my-radius` · `src/app/(app)/places/[slug]`

### [MEDIUM · S] Trigger the warm-events cron from the deploy pipeline to close the post-deploy cold window

Every hot cache is SHA-pinned (unified-events-v13, live-events-v2, map-upcoming-events-v1, find-picks, now-picks, town-event-counts all key on VERCEL_GIT_COMMIT_SHA), so a deploy busts them ALL simultaneously — and the warm-events cron only runs every 5 minutes, so for up to 5 minutes after each deploy every visitor to /today, /events, and /map pays the ~8s multi-feed cold assembly the cron exists to prevent (the exact "loads slow on fast network" symptom documented in warm-events/route.ts). With the current merge-then-auto-deploy cadence this happens on every ship. Fix: a Vercel deploy webhook (or a post-build step in the deploy-verify script that already polls EXPECTED_SHA) that hits /api/cron/warm-events with CRON_SECRET the moment the deployment goes live, pre-paying the fetch before the first real user arrives.

Files: `src/app/api/cron/warm-events/route.ts` · `vercel.json` · `scripts/prod-audit.mjs`

### [MEDIUM · S] Engineer away the manual cache-key-bump rule with a shared SHA-pinned cache wrapper

The CLAUDE.md "bump the unstable_cache key on shape change" rule (the PR #509 lesson) is enforced by hand-copying ["name-vN", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"] across 8 of the 11 unstable_cache call sites — and it has already been missed once: parking-live.ts line 174 uses a bare ["parking-occupancy-v1"] key (benign at 60s TTL, but proof the idiom doesn't self-enforce). Extract an appCache(fn, keyParts, opts) helper in src/lib/cache.ts that always appends the deploy SHA (with an explicit pinToDeploy:false escape hatch for the deliberately deploy-surviving 7-day Google enrich cache in /api/place/[slug]/enrich), and add an ESLint no-restricted-imports rule against raw next/cache unstable_cache outside that file. The stale-shape bug class then cannot recur, and the manual -vN bumps become optional documentation rather than load-bearing ritual.

Files: `src/lib/integrations/parking-live.ts` · `src/lib/loaders/unifiedEvents.ts` · `src/lib/loaders/ingested.ts` · `src/app/api/place/[slug]/enrich/route.ts` · `eslint.config.mjs`

### [MEDIUM · S] Automate places-client.json regeneration so it cannot drift from the loaders

"build": "next build" in package.json does NOT run build:client-places — the client dataset that search, map, and the funnel read is a committed artifact regenerated by hand, and CLAUDE.md itself records the failure mode (PR #503: surfaces shipped stale data after a cleaning change). Engineer the lesson away: either run scripts/build-client-places.ts as a prebuild step so the artifact is always derived from the current loaders at deploy time, or add a vitest drift check that regenerates in-memory and deep-compares against the committed src/data/places-client.json (failing with "run npm run build:client-places"), making the local test gate catch what memory currently must.

Files: `package.json` · `scripts/build-client-places.ts` · `src/lib/loaders/places-client.ts`

### [MEDIUM · M] Surface saved_events and follows aggregates as ranking signal and quiet social proof

saved_events (device saves, indexed by event_slug per drizzle/0013) is read ONLY by the saved-reminders cron, and follows.place_slug (indexed, with a source attribution column explicitly added "for product analytics") is never aggregated — the app collects genuine local-interest signal and throws it away. A cached loader (GROUP BY slug, count, hourly unstable_cache) could feed two field-guide-appropriate uses: a tie-break input to the existing relevance/worth-a-look ranking on /today, and a JetBrains Mono supporting detail on event pages ("12 locals saved this") only above a threshold so it stays calm and honest. This makes curation feel community-backed with zero new collection.

Files: `src/lib/db/schema.ts` · `src/app/api/cron/saved-reminders/route.ts` · `src/lib/worth-a-look.ts` · `src/lib/relevance.ts`

### [MEDIUM · S] Give commerce_link_reports an admin queue — broken-link reports currently go nowhere

Users can flag broken order/menu/reserve links via /api/commerce/report-link into commerce_link_reports (drizzle/0014, status defaults 'open', indexed on status for exactly this query), but /src/app/admin has queues for claims, reports, dedup-review, discovered-review, drift-review, copy-review, and data-health — and nothing for commerce links. A user does the app a favor, the row lands, and no human path ever reads it, so the dead link stays live indefinitely; the schema comment even says "An admin queue can read this later." Add a thin /admin/commerce-links page modeled on /admin/reports (list open rows, mark reviewed, deep-link to the place's overrides entry), and optionally fold a count into the data-health cron's daily summary so open reports can't silently pile up.

Files: `src/app/api/commerce/report-link/route.ts` · `src/lib/db/schema.ts` · `src/app/admin/reports/page.tsx` · `src/app/api/cron/data-health`

### [MEDIUM · S] Remove the /api/ask GET env-diagnostic and verify the KV rate limiter is actually armed

GET /api/ask (src/app/api/ask/route.ts lines 33-48) publicly returns the NAMES of every AI-ish env var plus boolean presence of ANTHROPIC_API_KEY/AI_GATEWAY_API_KEY — the comment says "TEMPORARY… Remove once Ask is confirmed live" (June 2026) and it is still shipping, handing recon to anyone. Meanwhile the POST's only real cost control, isRateLimited (src/lib/origin-check.ts line 93), silently no-ops when KV_REST_API_URL/KV_REST_API_TOKEN are unset and isSameOriginRequest passes any request with no Referer/Origin header — so if KV isn't configured on prod, a headerless curl loop against the paid Anthropic route is unlimited. Delete the GET (or gate it behind CRON_SECRET), and add a data-health check that alerts when the ask/place-photo rate-limit buckets are running in no-op mode.

Files: `src/app/api/ask/route.ts` · `src/lib/origin-check.ts` · `src/app/api/cron/data-health`

### [LOW · S] Drop or clearly quarantine the dead mirror tables (places, events, categories, tags, radii)

src/lib/db/schema.ts defines full places/events/municipalities/categories/tags tables described as a "future-prep mirror that isn't populated at write time," a radii table with zero runtime references, and a POSTGIS_NOTE recommending FTS/trgm indexes on tables that hold no production rows — while the actual catalog lives in src/data JSON and search runs on an in-memory index over places-client.json. The cost is ongoing confusion (three tables named like the real data but empty, RLS migrations 0009 covering them, drizzle migrations churned to drop their duplicate indexes) and a standing temptation for a future change to query the wrong source. Either commit to the migration (populate the mirror from the build pipeline and move /api/search to Postgres FTS, which the indexes were sketched for) or move these tables into a clearly-labeled future/ schema section and drop radii outright — half-real schema is worse than either choice.

Files: `src/lib/db/schema.ts` · `src/lib/db/seed.ts` · `src/app/api/search/route.ts`


## Visual craft & design-system drift

**The dimension in one paragraph:** The design system itself is unusually strong — tokenized radii/shadows/motion with disciplined reduced-motion coverage, a canonical 8-step type scale, and a distinctive field-guide vocabulary (fg-eyebrow, fg-rule, plate ticks) already written in globals.css — but the single biggest opportunity is that the May 2026 brand-deck migration and these primitives were shipped without being propagated: 100+ pre-deck hex literals (old brick #A03A22, old slate #2F5470, old gold #C99632) still color the map's seasonal/live layers, weather glyphs, and mood tiles; categoryMarkers.ts carries a fully drifted duplicate of the category palette so a place's map pin disagrees with its card accent; and the type scale has 40 adoptions against 1,620 ad-hoc text-[Npx] sizes with /today alone rendering five different serif section-header treatments. Finishing that propagation — mostly mechanical sweeps plus baking the field-guide flourishes into SectionHeading/EmptyState so they spread automatically — would make the app read as one printed document rather than eras of styling layered on top of each other.

### [HIGH · M] Finish the May 2026 brand-palette migration: 100+ stale pre-deck hexes still paint high-traffic surfaces

The brand deck swapped brick #A03A22 -> vermilion #E14328, slate #2F5470 -> #20506A, gold #C99632 -> #C0871F, danger #A02929 -> #B4231E, but the old literals survive across src: #A03A22 x33, #2F5470 x40, #C99632 x18, #A02929 x11. They sit on daily surfaces: MoodTiles.tsx:50 (Restroom tile), HourlyForecast.tsx:26-28 and WeeklyForecast (weather glyph colors), HistoryDeck, TransitMap, RadiusMap, amenities and history pages. AppMap.tsx:2075 even mixes eras in one expression (traffic = old gold #C99632, fallback = new slate #20506A), and the seasonal layer (lines 86-88, 2115-2117) is entirely old-palette. Users see two slightly different reds/golds/blues on the same screen. A one-day sweep replacing these with var(--app-*) tokens (or the new hexes where canvas/Mapbox needs literals) makes the shipped palette actually coherent.

Files: `src/components/map/AppMap.tsx` · `src/components/today/MoodTiles.tsx` · `src/components/today/HourlyForecast.tsx` · `src/components/today/WeeklyForecast.tsx` · `src/components/transit/TransitMap.tsx` · `src/components/radius/RadiusMap.tsx`

### [HIGH · S] Derive map pin colors from CATEGORY_BY_SLUG — categoryMarkers.ts is a drifted duplicate palette

src/components/map/categoryMarkers.ts:79-91 hardcodes its own category->color map that has drifted from src/data/categories.ts: food #A03A22 vs #E14328, brewery #C99632 vs #C0871F, music #9B3F8A vs #7E2C6F, family #B26B00 vs #C0871F, library/civic #2F5470 vs #20506A, wellness still the retired #A02929. So the same taproom shows a vermilion accent rail on its PlaceCard and an old-brick pin on /map — the core cross-surface color contract (card accent == pin) is broken for at least 6 top categories. Import CATEGORY_BY_SLUG (colors are already hex literals by design) and keep only the amenity/report kinds that have no category entry as local values.

Files: `src/components/map/categoryMarkers.ts` · `src/data/categories.ts`

### [HIGH · M] Adopt the shipped type scale — 1,620 text-[Npx] vs 40 uses of the canonical classes, with 100+ off-scale strays

globals.css defines the 8-step Brand Book scale (.text-caption/.text-meta/.text-body/.text-title...) precisely to replace ad-hoc sizes, but adoption is 40 instances against 1,620 text-[Npx] (410 x 11px, 259 x 12px, 211 x 13px...). Worse, 100+ are OFF the scale entirely: 33 x 12.5px, 25 x 10.5px, plus 32 instances at 8-9.5px mono uppercase (TodaysDealsStack.tsx:77 meta line at 9.5px, SavedList.tsx:539, TownAlmanac.tsx:24) that fall below the 10px caption floor and get genuinely hard to read on non-retina screens. Two-phase move: (1) mechanical sweep rounding every half-pixel and sub-10px stray to the nearest scale step — pure find/replace, immediately raises the floor; (2) migrate the 5 worst files (SavedList 40, EventCard 34, pulse/page 34, PlanBuilder 50, PlaceCard 25) to the semantic classes so line-heights stop varying per call site.

Files: `src/app/globals.css` · `src/components/saved/SavedList.tsx` · `src/components/event/EventCard.tsx` · `src/app/(app)/pulse/page.tsx` · `src/components/place/PlaceCard.tsx`

### [MEDIUM · S] Unify /today section headers — five serif h2 treatments in one scroll while /events uses one

Measured on prod: /today renders section h2s at font-serif 17px (Plan the moment), 18px x3 with three different leadings (I want to..., Pools this season, Find a place), 19px x2 (Happy hour, Today's briefing, one with tracking-tight and one tracking-[-0.01em]), 20px (text-xl Today), and 24-26px variants in other states — while /events uses SectionHeading (22px + accent tick) for all four of its sections. The flagship page has the least coherent heading rhythm in the app. Standardize Today modules on SectionHeading (or a compact 18px .text-title variant of it), which also gets the accent tick + count treatment for free and makes the page read as one composed document instead of eight independently-styled widgets.

Files: `src/components/ui/SectionHeading.tsx` · `src/components/today/TodaysDealsStack.tsx` · `src/app/(app)/today/page.tsx` · `src/components/today/TodayTabs.tsx`

### [MEDIUM · S] Vermilion as small text fails AA — sweep text uses of --app-brand to --app-brand-press

--app-brand #E14328 on the paper ground #EBE2CD measures ~3.2:1, below the 4.5:1 AA floor for small text, yet 114 call sites set color: var(--app-brand) directly — including real text links: TodaysDealsStack.tsx:147 ('All specials, by day', 12px), NowIntel.tsx:60 (/happy-hour link), EventsExplorer.tsx:542, EventSmartPairings.tsx:97-119. The token system already solved this: --app-brand-press #B5300F (~4.8:1) exists exactly for 'text-on-light'. Sweep: text/labels -> brand-press; icons and fills stay brand (3:1 graphics threshold is fine). Bonus: the deeper pressed red also reads more like printed ink, which suits the field-guide identity better than the bright signal color repeated 114 times.

Files: `src/components/today/TodaysDealsStack.tsx` · `src/components/today/NowIntel.tsx` · `src/components/event/EventsExplorer.tsx` · `src/components/event/EventSmartPairings.tsx`

### [MEDIUM · S] Roll the field-guide flourishes (fg-eyebrow, fg-rule, fg-plate) into shared primitives — they shipped but are orphaned

The FIELD GUIDE vocabulary in globals.css (mono plate eyebrows, hairline rules with end ticks, specimen corner ticks, plate numbers) is the strongest identity work in the system, but adoption is 5 files / ~22 uses; topo-bg and grid-paper are used by exactly one component (FromAboveTile), and --app-sage has 5 references. Meanwhile there are three competing eyebrow dialects: .eyebrow (11px sans), .fg-eyebrow (10px mono), and dozens of hand-rolled 'text-[10px] font-bold uppercase tracking-[0.1em]' spans (EventCard.tsx:276, PlaceCard.tsx:330,420). Highest-leverage move: bake fg-eyebrow + fg-rule into SectionHeading and EmptyState themselves (two edits propagate to every adopter), put fg-plate ticks on the feature-tier cards, and grid-paper behind the submit/report forms. The print identity deepens everywhere without touching individual surfaces.

Files: `src/app/globals.css` · `src/components/ui/SectionHeading.tsx` · `src/components/ui/EmptyState.tsx` · `src/components/today/TodaysDealsStack.tsx`

### [MEDIUM · M] Enforce the documented weight rule — semibold grew from the audited 624 to 841 uses

globals.css's own WEIGHT RULE comment calls 624 font-semibold uses 'monotony' and prescribes 400 quiet / 500 labels / 600 titles / 700 numerics-only. Today the count is 841 font-semibold + 187 font-bold vs only 204 font-medium — the drift got worse after being diagnosed. In practice chips, meta lines, CTAs and titles all sit at 600 (StatusChip 11px semibold, Rave 12px semibold, distance labels, 'See all' links), so nothing is quiet and titles lose their contrast advantage. A targeted sweep — chips/meta/links to 500, keep 600 for card titles, demote the 187 bolds that aren't numerals — restores the typographic hierarchy the field-guide bar depends on ('typography carries hierarchy before boxes').

Files: `src/components/place/PlaceCard.tsx` · `src/components/event/EventCard.tsx` · `src/components/ui/SectionHeading.tsx` · `src/app/globals.css`

### [MEDIUM · M] Route hand-rolled empty states through the EmptyState primitive

EmptyState.tsx is a genuinely designed moment (icon halo, serif statement title, tone system) but only 4 files use it, while 16+ surfaces render bare one-line empties: DealsBrowser.tsx:144 ('No verified deals on {day} yet.'), TodaysDealsStack.tsx:131 (a lone serif p), MonthGrid.tsx:234, HappyHourBrowser.tsx:202, TodayTabs.tsx:111-146, search/page.tsx:147, m/[municipality]/page.tsx:323. These are exactly the moments the CLAUDE.md 'honest empty states' bar is about, and the current bare text reads as a rendering gap rather than a calm absence. Most conversions are a 5-line swap since the copy already exists; the payoff is that the app's quietest screens stop looking unfinished.

Files: `src/components/ui/EmptyState.tsx` · `src/components/deals/DealsBrowser.tsx` · `src/components/today/TodaysDealsStack.tsx` · `src/components/happy/HappyHourBrowser.tsx` · `src/app/(app)/search/page.tsx`

### [MEDIUM · S] Settle the card-title convention: serif vs sans is currently decided per variant, not per tier

Across the two workhorse cards the title face flips arbitrarily: EventCard glance = sans 15px/600, tile = sans 14px, feature = serif 21px, compact date numeral = serif 17px; PlaceCard row = sans 16px/600, feature = serif text-lg, answer = display-3 serif, tile/grid = sans 15px/14px; TodaysDealsStack venue names = serif 15px. So on /today a deal venue is serif while the event card beside it is sans, and place rows (16px) sit next to event glances (15px) doing the same job at different sizes. Codify one rule — serif for feature/answer tiers and named places (the 'specimen name'), sans .text-title-sm (15px/600) for all dense-tier titles — and apply it in the two card files. This is the single highest-visibility consistency fix since these cards ARE the app's surface area.

Files: `src/components/event/EventCard.tsx` · `src/components/place/PlaceCard.tsx` · `src/components/today/TodaysDealsStack.tsx`


## Differentiators & delight

**The dimension in one paragraph:** The app already owns a set of assets no competitor can assemble — a 1958-2025 city orthoimagery scrubber, 104 geotagged seasonal drone shots, 85 adversarially-verified field-note dossiers, county-native sun/season/moon math, and live MARC/TransIT/USGS/NWS feeds — but they sit in silos: the single biggest opportunity is cheap joins between them, starting with the Aerial Time Machine, which is fully built at /from-above/time-machine and has literally zero inbound links in the app, followed by feeding the verified field-notes and weather/light data into the plan builder and event pages so plans and events read like a local walked you through them.

### [HIGH · S] Un-orphan the Aerial Time Machine and deep-link it from history and place pages

src/app/from-above/time-machine/page.tsx mounts 15 years of City of Frederick orthoimagery (1958-2025) as crossfading Mapbox raster layers — a genuinely un-copyable artifact — yet a repo-wide grep for 'time-machine' finds ZERO inbound links (MoreSheet links only /from-above/preview and /overhead). The client hardcodes INITIAL downtown and reads no searchParams. Add ?lng&lat&year support to AerialTimeMachineClient, then link it contextually: every HISTORY entry with geom (src/data/history.ts) gets a 'See this block in 1958' link in HistoryDeck, downtown place pages and /m/frederick get a 'Scrub the decades here' beat. A shipped, discoverable 'watch your block change since 1958' is the single highest wow-per-line-of-code feature in the repo.

Files: `src/components/from-above/AerialTimeMachineClient.tsx` · `src/app/from-above/time-machine/page.tsx` · `src/components/today/HistoryDeck.tsx` · `src/data/history.ts`

### [HIGH · S] Attach verified field notes (parking + one insider tip) to every plan stop

src/lib/integrations/planner.ts builds grounded itineraries but grep confirms zero field-notes integration; meanwhile src/data/field-notes.json holds 85 adversarially-verified dossiers with parking intel and insider tips (source_url + confidence + last_verified). Join fieldNotesFor(slug) at plan build/reconstruct time and render one quiet line per stop card in PlanBuilder: 'Park in the lower lot, the front spots fill first · verified 2w ago.' No other app can produce an evening plan that tells you where to park at each stop — it compounds the existing moat with data already committed.

Files: `src/lib/integrations/planner.ts` · `src/components/plan/PlanBuilder.tsx` · `src/lib/loaders/fieldNotes.ts` · `src/data/field-notes.json`

### [HIGH · M] Make the plan builder weather- and light-aware

planner.ts has no reference to nws/forecast/weather despite getNwsForecast (hourly probabilityOfPrecipitation, shortForecast) and almanac sunTimes both existing in-repo. Two rules, both calm: (1) if precip probability exceeds ~50% during the plan window, prefer indoor-capable stops and say why in the connective line ('Rain moves in around 8, so we kept the last stop indoors'); (2) for the outdoors vibe, order stops so the outdoor one lands before sunset and note golden hour. Run the weather pass server-side at build/reconstruct so the shareable URL spec stays unchanged. Turns /plan from a list-stitcher into something that visibly knows today's Frederick.

Files: `src/lib/integrations/planner.ts` · `src/lib/integrations/nws.ts` · `src/lib/almanac.ts` · `src/app/(app)/plan/page.tsx`

### [HIGH · M] Event pages: a 'getting there' block from parking garages, field-notes parking, and MARC/TransIT

src/app/(app)/events/[slug]/page.tsx has no transit or parking content (grep confirms), yet the repo holds parking-garages.ts, field-notes parking for 85 venues, getMarcBoard + marc-stations.ts coords, and TransIT stop predictions (transitNextStop/transitRealtime). For events with venue coords, render one quiet stanza: nearest garage with distance for downtown venues, the venue's verified field-note parking line when it exists, and 'Brunswick MARC is a 6 minute walk' when a station is within ~800m. This is the visitor acquisition moment from NORTH_STAR.md answered in one move, built entirely from existing loaders.

Files: `src/app/(app)/events/[slug]/page.tsx` · `src/data/parking-garages.ts` · `src/lib/loaders/fieldNotes.ts` · `src/data/marc-stations.ts` · `src/lib/integrations/marcTrains.ts`

### [MEDIUM · S] Golden-hour card that names a place, gated on clear skies

SunCountdown.tsx already counts down to golden hour (sunset minus 30 min) but never suggests where to be. Combine almanac.ts sunTimes + getNwsForecast hourly shortForecast near sunset (only render when it reads clear-ish, mirroring the AlmanacFooter self-hiding pattern) + a tiny curated west-facing sunset-spot list (Carroll Creek promenade, Baker Park, Gathland overlook from hidden-gems/curated-parks) to render one line on /today late afternoon: 'Golden hour at 7:53 tonight, clear. Carroll Creek catches it on the water.' Pure typography, appears maybe 3 days a week, and is the kind of beat only a county-native app produces.

Files: `src/components/today/SunCountdown.tsx` · `src/lib/almanac.ts` · `src/lib/integrations/nws.ts` · `src/data/curated-parks.ts` · `src/data/hidden-gems.ts`

### [MEDIUM · S] Ship the living-calendar 'seasonal note' from the almanac prototype

src/app/(app)/proto/almanac/page.tsx already computes a zero-dependency seasonalNote() (firefly season, spring bloom, peak foliage, frost windows for USDA 6b/7a) plus moonPhase, water gauges, and daylight delta — but it ships noindexed at /proto. Hoist seasonalNote into src/lib/almanac.ts and surface the one line on /today (near AlmanacFooter) and on TownAlmanac: 'Firefly season. Peak after dusk along the creek lines.' It changes roughly monthly, costs no API call, and no generic tool knows Frederick's firefly window. Optionally promote the full prototype to a real /almanac page as the daily-ritual destination.

Files: `src/app/(app)/proto/almanac/page.tsx` · `src/lib/almanac.ts` · `src/components/today/AlmanacFooter.tsx` · `src/components/municipality/TownAlmanac.tsx`

### [MEDIUM · S] 'On this day' pinning in the history deck

HistoryPulse.tsx rotates the Did-you-know deck by a day-index modulo, so Sept 17 (Antietam wounded flooding Frederick) is as likely to show a distillery fact as the anniversary. HISTORY entries carry year and free-text date_label but no structured month/day. Add optional month/day fields to the ~dozen exactly-dated moments in src/data/history.ts, and when today matches, pin that entry first with an 'On this day, 1862' kicker instead of the rotation. Small change, and it makes the ritual feel alive on the days that matter — the deck already handles imagery and swiping.

Files: `src/components/today/HistoryPulse.tsx` · `src/data/history.ts` · `src/components/today/HistoryDeck.tsx`

### [MEDIUM · M] Pair the next train/bus with an open place to wait in

NextTrainBoard (getMarcBoard, schedule-backed) and NextStopsBoard (TransIT getStopPredictions) show departures but leave the wait dead. Join the station/stop coordinate against clientPlaces + reliable-open-windows.ts open state within ~400m and add one line: '24 min until the 5:40 to Union Station. Beans in the Belfry is 4 minutes away and open.' Brunswick/Point of Rocks stations and downtown TransIT hubs all have curated places in range; RELIABLE_OPEN_WINDOWS makes the open claim honest without Google hours coverage. This is the live-layers-composed moment no transit app or directory can do alone.

Files: `src/components/transit/NextTrainBoard.tsx` · `src/components/transit/NextStopsBoard.tsx` · `src/data/reliable-open-windows.ts` · `src/data/marc-stations.ts` · `src/lib/loaders/places-client.ts`

### [MEDIUM · M] A printable weekend one-pager from the unified event set

globals.css has no @media print rules and /weekend was retired, but the field-guide aesthetic (Newsreader, paper cream, dense columns) is literally a print design. Add a 'Print the weekend' affordance on /events that renders one clean sheet from unifiedEvents.ts weekend tier + Saturday/Sunday farmers markets (farmers-markets.json) + sunrise/sunset and moon phase from almanac.ts — the thing you stick on the fridge Friday afternoon. Implementation is a print stylesheet plus a compact server-rendered view over loaders that already exist; it doubles as organic marketing when the sheet circulates.

Files: `src/app/(app)/events/page.tsx` · `src/lib/loaders/unifiedEvents.ts` · `src/data/farmers-markets.json` · `src/lib/almanac.ts` · `src/app/globals.css`

### [MEDIUM · S] Creek check on trail and river-adjacent park pages

USGS gauge data (getFrederickWaterSites + readingTrend + classifyFlood) currently surfaces only as the flood-only CreekWatch line on /today and the /rivers page. Trails like the C&O towpath at Brunswick and Monocacy-adjacent parks (curated-trails.ts, fcTrails) would carry a one-line 'Monocacy at Frederick: normal and falling, towpath should be dry' by joining the trail coordinate to the nearest WaterSite. It reuses the flood-stage honesty machinery for the everyday positive case — the question hikers actually ask after rain — and stays silent when there is nothing to say.

Files: `src/lib/integrations/usgsWater.ts` · `src/lib/integrations/floodStage.ts` · `src/data/curated-trails.ts` · `src/components/today/CreekWatch.tsx`

### [LOW · S] Rotate sourced town cliffnotes into the Today did-you-know deck

src/data/town-cliffnotes.json holds sourced, confidence-rated fun_facts for all 13 towns (Berlin-to-Brunswick mail confusion, the 5-mile B&O yard) but they render only on /m/[municipality] via TownAlmanac — a page most users rarely visit. Mix one cliffnote per day into the HistoryDeck rotation with a town kicker ('Brunswick · from the town file') linking to /m/brunswick. It spreads attention across the 12 municipalities plus Urbana instead of Frederick-city-only history, and drives discovery of the town pages where the aerial beats and almanacs already live.

Files: `src/data/town-cliffnotes.json` · `src/components/today/HistoryPulse.tsx` · `src/components/municipality/TownAlmanac.tsx`


## Blind spots (launch readiness, growth)

**The dimension in one paragraph:** The codebase is unusually well-instrumented for a solo project (Sentry live on prod, Plausible live, hand-rolled versioned service worker, Slack-alerting data-health cron), so the classic blind spots are covered — but the growth loop around the product is almost entirely disconnected, and one core feature is simply off: the Ask tab (nav slot #1) returns configured:false in production because no AI key is set, the beta wall serves every social scraper a generic 'private beta' card so word-of-mouth sharing and SEO warm-up are both dead, robots.ts blocks the AI answer engines that increasingly field 'what's happening in Frederick' queries, only five map_* analytics events exist so launch questions about activation/retention will be unanswerable, and nobody who has ever visited can be contacted because no email is captured anywhere. The single biggest opportunity is a launch-readiness pass on this connective tissue — turn Ask on, let scrapers through the wall, unblock answer-engine crawlers, instrument the activation funnel, and start collecting emails on /beta — none of which touches the locked architecture or the field-guide aesthetic.

### [HIGH · S] The Ask tab — nav slot #1 — is dead in production: no AI key is configured

POST https://frederickradius.app/api/ask returns {"configured":false,"answer":null} today, and the route's own GET diagnostic confirms AI_GATEWAY_API_KEY, ANTHROPIC_API_KEY, and OPENAI_API_KEY are all false in vercelEnv=production. That means the first tab in the locked nav (Ask → /guide) shows a coming-soon state for every beta tester, and per the comment in src/app/api/ask/route.ts this has been broken since at least the 2026-06-10 redeploy marker. Bonus: that GET diagnostic (explicitly labeled 'TEMPORARY ... Remove once Ask is confirmed live') is still publicly serving the names of AI-ish env vars three weeks later. Fix the env-var scope in Vercel (the comment itself notes env vars only land in NEW builds — a cache-reusing redeploy won't pick them up), verify configured:true on prod, then delete the diagnostic. Nothing else in the roadmap matters more than turning on the marquee feature.

Files: `src/app/api/ask/route.ts` · `src/lib/ask/answer.ts` · `src/components/ask/AskFrederick.tsx` · `src/components/nav/tabs.ts`

### [HIGH · M] The beta wall silently kills every shared link's preview and the entire SEO runway — no launch plan exists for either

Verified live: curl -A "facebookexternalhit/1.1" https://frederickradius.app/events → 307 to /beta, and /beta is robots noindex (src/app/beta/page.tsx). So every place/event link a beta tester texts or posts renders the generic 'private beta' card — the carefully built /api/og cards (place, event, muni, story format) are unreachable by any scraper — and Google currently indexes zero of the ~1,000+ URLs the audited sitemap.ts emits (Search Console sees all of them as redirects). Word-of-mouth during the highest-enthusiasm period is muted, and at public launch indexing starts from absolute zero. Fix in middleware.ts betaGate: pass known link-preview user agents (facebookexternalhit, Twitterbot, Slackbot, LinkedInBot, Discordbot, WhatsApp, Applebot for iMessage) through to the real page so shares work during beta, and decide an indexing runway (e.g. un-wall /places/*, /m/*, /collections/* content pages a few weeks before launch, then request reindexing).

Files: `src/middleware.ts` · `src/lib/beta-gate.ts` · `src/app/beta/page.tsx` · `src/app/api/og/route.tsx` · `src/app/sitemap.ts`

### [HIGH · S] robots.ts blocks AI answer engines (OAI-SearchBot, ChatGPT-User, PerplexityBot), forfeiting the fastest-growing discovery channel for exactly this product

src/app/robots.ts disallows 17 'AI training' UAs from the whole site, but the list conflates training crawlers (GPTBot, CCBot, Google-Extended — fine to block) with answer-engine and user-triggered fetch agents: OAI-SearchBot powers ChatGPT search citations, ChatGPT-User is the agent fetching a page when a user asks about it, PerplexityBot powers Perplexity answers, and Claude-Web is Claude's user-fetch. 'What's open in Frederick tonight' and 'things to do in Frederick this weekend' are precisely the queries migrating to these assistants, and Frederick Radius has the best structured answer in the county — the events/places pages with audited JSON-LD are ideal citation targets. Blocking them means competitors (visitfrederick.org, Yelp) get the citation instead, forever. Split the list: keep the training opt-out, allow the search/fetch agents (OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-Web, Applebot).

Files: `src/app/robots.ts`

### [HIGH · S] Analytics can't answer a single launch question: only 5 custom events exist, all of them map_*

Plausible is live on prod (NEXT_PUBLIC_PLAUSIBLE_DOMAIN confirmed set) and src/lib/track.ts is a clean helper, but a repo-wide grep finds exactly 5 unique events: map_ready, map_pin, map_cluster, map_layer, map_locate. Nothing fires on the moments that define activation and retention — save/follow a place, push opt-in (NotificationsNudge), PWA install (useInstallPrompt), Ask question submitted, add-to-calendar, /report submission, search use, beta unlock. At launch the owner will have pageviews plus map telemetry and no way to answer 'do new visitors activate?', 'does push opt-in retain?', or 'which entry surface (Today vs Map vs Events) converts to saves?'. Add ~10 track() calls at those moments and define them as Plausible goals now, so there's a pre-launch baseline to compare against. This is an afternoon of work with an existing helper.

Files: `src/lib/track.ts` · `src/components/pwa/NotificationsNudge.tsx` · `src/hooks/useInstallPrompt.ts` · `src/components/place/MyRadiusButton.tsx` · `src/components/ask/AskFrederick.tsx`

### [HIGH · M] Zero owned audience: no email capture anywhere, so beta testers are anonymous and launch day has no announcement channel

The /beta unlock page collects only the shared password — everyone who has ever tried the app is unreachable. A repo-wide grep for newsletter/waitlist/signup finds nothing but data files; the only inbound is mailto:hello@frederickradius.app correction links. When the wall drops there is no list to announce to, and the daily-briefing cron already composes exactly the content a weekly 'Frederick this week' email would need (src/app/api/cron/daily-briefing/route.ts). Two moves: (1) add an optional one-field email input on /beta ('want launch news?') stored in a Supabase table — infra identical to the existing community_reports pattern; (2) later, a digest email built from the briefing composer. For a hyper-local product, an owned list of a few hundred county residents is worth more than any paid channel and can never be built retroactively for people who already visited.

Files: `src/app/beta/page.tsx` · `src/app/api/beta` · `src/app/api/cron/daily-briefing/route.ts`

### [HIGH · S] Paid-upstream APIs are already publicly open (beta-exempt) and the rate limiter is a silent no-op without Vercel KV — verify it before the wall drops

middleware.ts isBetaExempt() passes all of /api/* through the beta wall, so /api/ask (LLM-billed once the key lands), /api/place-photo (Google, ~$7/1k), /api/travel-time and /api/isochrone (Mapbox) are hammerable from the open internet today. The only defenses are a forgeable Referer check plus isRateLimited() in src/lib/origin-check.ts, which by its own doc 'is a NO-OP that always allows the request' when KV_REST_API_URL/KV_REST_API_TOKEN aren't set — and there is no signal anywhere (log line, Sentry breadcrumb, admin tile) telling the owner which mode production is running in. The failure mode is a four-figure Google/OpenAI invoice discovered at month end. Actions: confirm the KV env vars exist in prod (a one-line addition to the /api/ask GET diagnostic would do it), have the no-op path log once per boot, and set billing alerts/caps in the Google Cloud, AI, and Mapbox consoles.

Files: `src/lib/origin-check.ts` · `src/middleware.ts` · `src/app/api/place-photo/route.ts` · `src/app/api/ask/route.ts`

### [MEDIUM · M] Supabase is the only copy of user-generated data and schema truth — no dump script, PITR unverified, migrations intentionally un-replayable

package.json BLOCKS db:migrate and db:push because the drizzle journal is 'intentionally partial' and schema.ts omits the raw-SQL ingestion tables and RLS — meaning the production database is the only complete record of its own schema. Meanwhile community_reports (residents' field reports with photos), push_subscriptions, follows, and saved_events accumulate in Supabase with no export path: grep finds no pg_dump/backup script, and docs/HOSTING_CHECKLIST.md lists 'Database → Backups (enable PITR)' as a manual dashboard step with no evidence it was done. If the Supabase project is deleted, paused, or fat-fingered, the community layer — the data users gave the app, the part that can't be re-ingested — is gone. Add a nightly cron (or GitHub Action) that pg_dumps the user tables to Vercel Blob, and commit a `pg_dump --schema-only` snapshot to the repo so disaster recovery doesn't depend on memory.

Files: `package.json` · `drizzle/README.md` · `docs/HOSTING_CHECKLIST.md` · `src/lib/db/schema.ts`

### [MEDIUM · S] Every automated quality gate is dead: CI is permanently red and Playwright e2e runs nowhere

CLAUDE.md itself codifies the problem: 'CI verify / style-lint are pre-existing infra reds (account-level Actions limits) — local runs are the gate.' A gate that lives in humans' (and agents') memory is not a gate — every PR merges over a red X, which trains everyone to ignore CI entirely, and the playwright.config.ts / e2e suite in the repo executes on no machine. The cheapest durable fix needs no GitHub Actions at all: chain the checks into the Vercel build (`"build": "tsc --noEmit && vitest run && next build"` or a vercel.json buildCommand), so a red typecheck or test physically cannot deploy. Add the lighthouse script (npm run perf, already written in scripts/lighthouse-audit.ts) to the post-deploy prod-audit ritual with a stored baseline so performance regressions on the map bundle are caught rather than felt.

Files: `package.json` · `playwright.config.ts` · `scripts/lighthouse-audit.ts` · `scripts/prod-audit.mjs`

### [MEDIUM · S] The only feedback channel is mailto:, which silently fails for most mobile-PWA users

All correction/feedback affordances (PlaceSheet.tsx:642, places/[slug]/page.tsx:494 and :576, AppFooter.tsx:49, contacts/page.tsx:299) are mailto: links to hello@frederickradius.app. In an installed PWA or on a device without a configured mail client, tapping these does nothing — the user thinks the button is broken and the owner never hears about it. The app already has the exact infrastructure needed: /api/reports takes free-text submissions, sanitizes/spam-screens them, and queues them for /admin review. Add a lightweight 'Something wrong here?' sheet on place and event pages that posts a correction into that same moderation queue (new category, no photo requirement, no TTL), keeping mailto as a secondary link. During beta this is the single highest-value listening post, and data corrections from locals are the moat the whole field-guide concept depends on.

Files: `src/components/place/PlaceSheet.tsx` · `src/app/(app)/places/[slug]/page.tsx` · `src/components/nav/AppFooter.tsx` · `src/app/api/reports/route.ts`

### [MEDIUM · S] Beta testers get silently re-walled every 30 days with no way back but a password they've forgotten

The fr_beta cookie set by /api/beta lasts 30 days (src/lib/beta-gate.ts documents the design), so a tester who unlocked in early June hits the /beta wall again in July mid-session — likely from an installed PWA home-screen icon where re-entering a shared password they no longer remember is high-friction. There's no 'request access' path on /beta (no email field, no contact link rendered prominently), so a re-walled tester most likely just bounces, and the owner loses exactly the retained users the beta exists to study — invisibly, since nothing tracks beta-wall hits from returning devices. Cheap fixes: extend cookie max-age to ~180 days and refresh it on each authenticated visit (sliding expiry in betaGate), track a beta_walled event, and put a mailto/request-access line on the /beta cover.

Files: `src/lib/beta-gate.ts` · `src/middleware.ts` · `src/app/beta/page.tsx`
