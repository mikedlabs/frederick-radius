# REDUCTION.md: Phase 1 Kill List and Choice Budget

Phase 1 of the premium redesign program. Date: 2026-06-12. This document makes zero code changes. It is the execution order for the reduction: every element, filter, section, route, and option in the app was judged against the two-mode architecture, and the default verdict was death. Survival required an argument.

**The two modes, restated as the test.** Fast mode answers "what is good near me right now" in under 10 seconds, map-first and time-aware. Guided mode is a short conversation that ends in three picks delivered with a point of view. An element survives only if it serves one of those two sentences or a protected item. "It might be useful" is not an argument; it is the reasoning that produced 253 component files and a 320-choice events page (B-density.md sections 1 and 5.2).

**Protected, per the program charter.** The place detail page structure (A-journey.md line 139), the event detail page structure (A-journey.md line 139), search result quality for real queries (A-journey.md line 35), /plan's answer commitment (A-journey.md lines 77 to 83), the data pipeline architecture (AUDIT.md "What holds up"), /terms (legally required), and the my-radius saved-places concept (the data, not necessarily the current UI).

**Accounting rule for "choices."** This document counts choices the way A-journey.md line 9 defines them: related controls group into one choice (a chip rail is 1 choice, the tab bar is 1 choice). Raw interactive-element counts are reported alongside as supporting data. The budget is at most 5 above-fold choice groups per screen with exactly 1 primary action.

**Governance note.** CLAUDE.md locks the 5-tab nav and the canonical/sitemap layer. Sections 1.c and 1.g of this document propose changes to both. Those proposals are Phase 1 paper, and executing them in Phase 3 requires founder sign-off plus a re-run of the June 2026 canonical audit (PRs #504, #516 to #520, #530) with 301 redirects for every killed URL.

---

## 1. The kill list

### 1.a The 41 dead component files: kill, zero loss

B-density.md section 1.3 (lines 43 to 49) verified by import tracing that 41 files have no live render path. They cost the user nothing today because nothing renders them, and nothing user-facing breaks when they die; what they cost the program is real, because two of four Phase 0 code sweeps initially counted ghosts as live surfaces (B-density.md line 256).

**Execution order.** Delete every file in B-density.md section 1.3 outright, with one exception class: the 5 pitch-stranded files (`map/index.tsx`, `map/map-component.tsx`, `ui/glass-card.tsx`, `ui/animated-button.tsx`, `ui/gradient-text.tsx`) are imported by marketing scenes (B-density.md line 49), so they move under `src/components/marketing/` instead of dying, or they die together with /pitch if the founder retires that route. Also delete the archeology comment block at `src/app/(app)/today/page.tsx:68-87` that memorializes ten of the cuts while the files persist.

The kill, grouped as B-density.md lists it:

- **today/ (29 files):** MoodTiles, FeaturedEvents, FeaturedTonightPicker (FeaturedTonight transitively), HistoryPulse (HistoryDeck transitively), NearbyNow, RedditPulse, FromAboveTile, PrimaryActionCard, TodayTabs, TodayFilters, TodayActions, TodayAsk (ask/AskFrederick transitively), LocalNewsStrip, HiddenSectionsBar, AdaptiveGreeting (PersonalGreetingLine and InterestsChip transitively), ModeLead (today/ModeToggle transitively), ExploreFooter, AlmanacFooter, ComingSoon, ClusteredSpires, RidgeLine, TuneForYou, FloatingPlanFab, RightNow (RightNowGrid transitively), WeatherHero, SunCountdown, LivePulse, LiveActivityPill, Module.
- **now/ (2):** RightNow, RightNowStrip.
- **event/ (5):** LensBar, WeekStrip, CategoryJumpTiles, EventsByTown, EventsCompartmented.
- **mode/ (1):** ModeSwitch. The Resident/Visitor persona system has no surviving UI (B-density.md line 196); the persona concept dies with it unless Phase 2 revives it on purpose.
- **radius/ (2):** BestNearbyMoves, WithinReach.
- **ui/ (3):** Shelf, CreekHairline, StatStrip.
- **Relocate to marketing/ (5):** map/index.tsx, map/map-component.tsx, ui/glass-card.tsx, ui/animated-button.tsx, ui/gradient-text.tsx.

This single action removes 8 dead card designs (B-density.md section 2.2), 7 dead chip vocabularies (B-density.md section 3.2), and roughly 16 percent of the component tree.

### 1.b The 22 chip vocabularies: 4 survive

B-density.md section 3.1 catalogs 22 live vocabularies, 12 on /map alone. Four survive because each answers one of the four questions a Fast-mode user has: when, what, open, and how far. Everything else dies or folds into one of the four. The four survivors share one URL grammar and one set of time boundaries, ending the situation where Tonight starts at 16:00 on the map and 17:00 on /today (B-density.md line 258).

**The survivors:**

1. **WHEN.** One temporal chip set with the options Now, Tonight, Tomorrow, Weekend, one `?t=` grammar, and one boundary table defined once in `src/lib`. It absorbs vocabulary #4 (MapTimeChips, map/MapTimeChips.tsx:24-33), #13 (TimeToggle, today/TimeToggle.tsx:21-30), the temporal half of #19 (events quick chips, EventsExplorer.tsx:304-327), and the day-picking job of #22 (EventWeekRibbon.tsx), whose date-jump job moves to the /events calendar state.
2. **WHAT.** One two-tier intent taxonomy sourced from `src/data/intents.ts` (12 intents, sub-intents on demand). It absorbs #2 and #3 (map intent and sub-intent chips, MapIntentChips.tsx:277-308), #6 (the 18-toggle Layers category cluster, AppMapDeck.tsx:502-618, which collapses into the intent taxonomy per B-density.md consolidation 3), #12 (cuisine facets, RadiusBuilder.tsx:1444-1455, which are the eat sub-intents), #15 and #16 (guide tiles and sub-rail, FunnelFlow.tsx:373-392 and 461-493, which render the same intents data), the category half of #19 and #21 (events quick chips and facet drawer categories, which adopt the same taxonomy), and the job of #14 (CravingStrip).
3. **OPEN.** One boolean Open-now chip with one predicate and one count source (AUDIT.md blocker 2). It absorbs #5 (map browse open toggle, MapTimeChips adjacent pill), #11 (radius open-only toggle, RadiusBuilder.tsx:1263-1279), the open-now option inside #18 (guide filters, FunnelFlow.tsx:497-534), and the job of the /open-now route (section 1.c).
4. **RANGE.** The radius preset set (5 min walk through 30 min drive, RadiusPresets.tsx:31-36) rendered as chips, plus one final stop labeled Whole county. It absorbs #10 (the travel-mode segmented control plus slider, RadiusBuilder.tsx:853-892, which expresses the identical state a second time) and #1 (MapModeToggle, map/MapModeToggle.tsx:30-33, because Whole county becomes the largest range value instead of a separate mode with its own control system).

**The deaths, each with its cost and destination:**

| # | Vocabulary (cite) | What it costs the user today | What breaks if it dies, and where the job moves |
|---|---|---|---|
| 1 | Map mode toggle (MapModeToggle.tsx:30-33) | It forces a mode decision before the map answers anything, and it swaps the entire control system on toggle. | Nothing breaks; Whole county becomes the max RANGE stop and the two control systems become one. |
| 4, 13, 19-time, 22 | Four temporal sets (cites above) | The user learns four vocabularies and three URL grammars for the question "when," and the sets disagree on when Tonight starts. | Deep links using `?d=` break; the calendar state of /events keeps date-jumping, and everything else speaks WHEN. |
| 5, 11, 18-open | Three extra Open-now controls (cites above) | The same toggle exists four ways and feeds three different counts (A-journey.md line 127). | Nothing breaks; OPEN with one predicate replaces all of them. |
| 6 | Layers categories, 18 toggles (AppMapDeck.tsx:502-618) | It duplicates the intent taxonomy a second time on the same screen, and the coffee filter alone exists by three roads (B-density.md line 260). | Saved/Churches quick toggles vanish as toggles; Saved becomes a WHAT entry, and category pin-filtering moves to WHAT. |
| 7 | Amenity groups, 12 toggles (AppMapDeck.tsx:633-654) | Twelve always-rendered toggles tax everyone for restroom and EV layers that few sessions need. | Nothing breaks; the 12 groups become a checklist inside the single Layers disclosure of the map sheet, CAN-REQUEST tier. |
| 8 | Infrastructure and GIS overlays (AppMapDeck.tsx:656-790) | Eleven more toggles render on the busiest control surface in the app. | Nothing breaks; they join the same Layers checklist behind one door, keeping `?layers=` deep links. |
| 9, 10 | Radius presets as cards plus segmented-plus-slider (RadiusPresets.tsx:31-36; RadiusBuilder.tsx:853-892) | The same state is expressed twice with two widget systems, and the preset cards are a fourth card design on one screen. | Fine-grained minute control (the 3-to-30 slider) dies; the 6 preset stops cover real use, and the chips are one group. |
| 12 | Cuisine facet chips (RadiusBuilder.tsx:1444-1455) | A parallel FilterChip implementation renders eat sub-intents under a different name. | Nothing breaks; WHAT tier two carries cuisine. |
| 14 | CravingStrip (now/CravingStrip.tsx:42-55) | All 8 chips silently discard the user's choice through the retired /nearby redirect (B-density.md line 206); each tap is a lie today. | Nothing breaks because nothing works; the job (one-tap intent plus open-now) moves to WHAT plus OPEN on /map. |
| 15, 16 | Guide intent tiles and sub-rail (FunnelFlow.tsx:373-392, 461-493) | The browse-hub bento makes the Ask tab a directory, and its counts contradict the funnel one tap later (286 became 24+, A-journey.md line 127). | The bento front door breaks by design; Guided mode replaces browsing with a conversation, and intent browsing remains on /map and /places via WHAT. |
| 17 | Guide moment lenses (FunnelFlow.tsx:83-91, 400-414) | Five lenses (Date night, With kids, Happy hour, Dog-friendly, Live music) add a filter layer between the user and the answer. | Nothing breaks; these are Guided-mode conversation inputs and become the /plan mood picker's vocabulary. |
| 18 | Guide result filters and sort (FunnelFlow.tsx:497-534) | Twenty-plus filter controls precede the Best match answer (A-journey.md line 25). | Sorting dies on purpose: a guide commits to an order; Open-now joins OPEN, Near-me becomes RANGE context, and the rest die. |
| 19 | Events quick chips (EventsExplorer.tsx:304-327) | A seventh mixed vocabulary restates time and category options that exist elsewhere. | Nothing breaks; time goes to WHEN, categories go to WHAT. |
| 20 | Events view segmented, List/Compact/Agenda/Map (EventsExplorer.tsx:42-47, 355-360) | Four presentation modes of one list quadruple the layouts a user must learn. | Saved view preferences break; one list anatomy survives, and the Map view is the Map tab with WHEN set. |
| 21 | Events facet drawer (EventsExplorer.tsx:466-508) | An All-plus-10-categories and All-plus-14-towns drawer server-renders about 25 controls nobody opened. | Nothing breaks; categories go to WHAT, town scoping goes to the town pages and the map center select. |
| 22 | Events week ribbon (EventWeekRibbon.tsx:21-22, 115+) | Seven day cells with counts compete with the WHEN chips above them. | Day-jumping moves to the /events calendar state; WHEN covers the rest. |

The 7 dead vocabularies in B-density.md section 3.2 die with their files in section 1.a.

### 1.c Routes: 35 become 20

B-density.md section 4.2 maps 35 routes under `src/app/(app)/`. The 5-tab nav becomes a 4-tab nav (section 1.g). Every killed URL keeps a 301. Dynamic detail routes count once each.

**Survivors (19 existing plus 1 new):**

| Route | Argument for survival |
|---|---|
| `/` | It survives as a one-line redirect (app/(app)/page.tsx:8) because the root must resolve somewhere; it costs nothing. |
| `/guide` | It survives as the Ask tab and is rebuilt as the Guided-mode front door: one input, starter prompts, and a path that ends in three picks; the bento browse hub inside it dies (section 1.b, #15). |
| `/today` | It survives as the daily-return briefing rebuilt as a now-state machine (D-references.md pattern 8): one lead per time state. |
| `/map` | It survives as the Fast-mode core; its 12 vocabularies collapse to the 4 of section 1.b. |
| `/events` | It survives as a route, loses its tab (section 1.g), and is cut to one tier per B-density.md consolidation 5. |
| `/events/calendar` | It survives as the single date-picker state of /events, absorbing the week ribbon's job. |
| `/events/civic` (new) | The civic meetings, town reminders, and 80-series municipal calendar move here from the main feed, reached by the existing "Government and notices" divider (events/(list)/page.tsx:499-511); this is the cut that takes /events from roughly 320 rendered choices to under 60. |
| `/events/[slug]` | Protected; it is the cleanest screen in the app (A-journey.md line 110). It keeps no loading.tsx, per the locked soft-404 rule in CLAUDE.md. |
| `/places` | It survives as the reference index, the calmest hub in the app (A-journey.md line 27), and absorbs /towns and /category/[slug]. |
| `/places/[slug]` | Protected; the destination layer works (AUDIT.md "What holds up"). |
| `/m/[municipality]` | The 13 town pages survive because they are the field-guide identity itself and the home of the Constant Band (D-references.md pattern 3); their "Worth your time" carousel may not re-ship until AUDIT.md blocker 1 is fixed. |
| `/search` | The URL survives as a thin shell so `?q=` deep links keep working, but it renders the one SearchPanel component; its separate page UI dies (section 1.e). |
| `/plan` | Protected and promoted: it gains entries from the Ask conversation, the /today evening state, and the my-radius primary CTA, ending its life as a search-overlay secret (A-journey.md line 79). |
| `/my-radius` | It survives as the Saved tab; the saved-places data is protected, and it is the only screen near budget today (B-density.md line 232). |
| `/contacts` | It survives demoted to a reference page reached only from the /places "Who to call" row (places/page.tsx:216); a civic directory is a CAN-REQUEST job, not a drawer tile. |
| `/collections/[slug]` | Individual collections survive as shareable editorial pages because they are hand-curated point of view, the raw material of Guided mode. |
| `/about`, `/trust` | Both survive behind the footer; /trust carries the provenance explanation the trust thesis depends on. |
| `/settings` | It survives behind the footer and absorbs /settings/notifications as a section. |
| `/terms` | Protected by law. It is an orphan today with zero inbound links (B-density.md line 204), which means the legally required page is unreachable; it gains a footer link. |

**Deaths (16), each with cost and destination:**

| Route | What it costs the user today | What breaks, and where the job moves |
|---|---|---|
| `/category/[slug]` | It is a third browsing system that duplicates the WHAT taxonomy with its own URLs. | Indexed category URLs break without 301s; the job moves to /places filtered states on the WHAT taxonomy, and 301s plus a canonical re-audit are mandatory. |
| `/towns` | A 13-link index page duplicates the town strip already on /places (places/page.tsx:336). | The AppFooter /towns link breaks; /places "By town" absorbs the job, 301 to /places. |
| `/open-now` | A separate route holds the only honest open count (15 verified) while other surfaces print 54 and 29 (A-journey.md line 127). | SearchOverlay quick-answer links break until repointed; the route 301s to /map?open=now, and its verified-open predicate becomes THE count predicate everywhere (AUDIT.md blocker 2). |
| `/pulse` | A county-alerts page hides behind a header dot most users never decode. | The PulseIndicator target dies with the indicator (section 1.g); alerts move into the /today briefing, plus a top-of-screen banner on any severe alert. |
| `/parking` | A standalone parking page sits in a drawer while parking questions occur on place pages and the map. | MoreSheet link dies with the sheet; the job moves to the map Layers checklist and the parking note in the place-detail visit strip (D-references.md pattern 10). |
| `/amenities` | A page duplicates the map's 12 amenity layers as a second surface. | Nothing else links here; the Layers checklist on /map absorbs it, 301 to /map. |
| `/transit` | A standalone transit page duplicates the map transit overlay (lib/overlays.ts:38-81). | The job moves to the map Layers checklist, 301 to /map?layers=transit. |
| `/trails` | A trails index duplicates both the Get outside intent and the trails GIS overlay. | The job splits to /places (WHAT: Get outside) and the map trails layer, 301 to /places. |
| `/parks` | Same shape as /trails: a third rendering of outdoor content. | Same destination, 301 to /places. |
| `/rivers` | Live USGS gauges occupy a whole route plus the MetricCard design for a niche check. | MetricCard dies (section 1.d, #24); gauges stay as a map layer (the Gauges amenity group, map/constants.ts:73+) and surface in the /today conditions line when a gauge crosses a flood threshold. |
| `/collections` (index) | An index of collections hangs two low-discoverability hops off /about (B-density.md line 205). | The about-page link breaks; a collections shelf on /places lists them, 301 to /places. |
| `/history` | Almanac content sits on a near-orphan route nobody reaches (B-density.md line 205). | The /about link breaks; the content redistributes as one almanac line per place and town page (D-references.md pattern 1), which is the form Wildsam proves works. |
| `/settings/notifications` | A sub-page adds a navigation hop for four toggles. | NotificationsNudge deep link repoints; the toggles become a section of /settings. |
| `/find` | A bare redirect stub adds nothing. | Nothing breaks; keep the 301 at the platform layer and delete the route file. |
| `/nearby` | The redirect discards its query parameter, which is what breaks all 8 craving chips (nearby/page.tsx:11-13). | CravingStrip dies first (section 1.b, #14), then nothing links here; keep a platform 301 and delete. |
| `/weekend` | A bare redirect stub to /events. | Nothing breaks; platform 301, delete the file. |

Out of scope for this census: the non-(app) shells `admin/*`, `auth/login`, `business/*`, `submit/*`, `from-above/*`, `offline`, `welcome`, and `pitch` are operational or marketing surfaces, not user-journey screens, and Phase 1 leaves them as they are.

### 1.d The 35 card designs become exactly 3

B-density.md section 2.1 catalogs 35 distinct card structures. Three survive, named here. The names avoid every banned term. A user who has seen each once has seen the whole system.

**The three cards:**

1. **Plate (the hero card).** At most one renders per screen. It carries: an eyebrow state label (the answer to "why this, now"), the name in the display serif, one verdict line stating the point of view (D-references.md pattern 5), one status word from the controlled vocabulary, one mono detail line (distance, time, price), exactly one action, and an optional full-bleed photograph only where the asset passes the AUDIT.md blocker 4 treatment standard, with the typographic form as the fallback (D-references.md pattern 7). The Plate is the only card allowed to spend vermilion, and only on its action.
2. **Entry (the standard card).** The Monocle listing anatomy for rails and grids: name in the serif, verdict line, one mono detail line, an optional small thumbnail, whole-card tap target, zero inline action buttons. Section grouping carries category; the Entry carries no category badge.
3. **Index Row (the compact row).** One line, border-b separated: a status dot or date block on the left, the name, and a right-aligned mono detail (time, date, or distance). It is the unit of every dense list, and stacks of Index Rows with a number column form the /plan itinerary.

**Disposition of all 35 production designs (numbering from B-density.md section 2.1):**

| # | Design (cite) | Verdict | Cost and destination |
|---|---|---|---|
| 1 | PlaceCard row (PlaceCard.tsx:489+) | Dies into Entry. | Nothing is lost; the anatomy maps one to one. |
| 2 | PlaceCard grid (PlaceCard.tsx:447) | Dies into Entry. | B-density.md line 122 confirms the difference is dimensions only. |
| 3 | PlaceCard tile (PlaceCard.tsx:382) | Dies into Entry. | Rails render Entries at a fixed width. |
| 4 | PlaceCard feature (PlaceCard.tsx:240) | Dies into Plate. | The map best-match slot renders a Plate. |
| 5 | PlaceCard answer (PlaceCard.tsx:295) | Dies into Plate. | The guide answer renders a Plate; the quote block becomes the verdict line. |
| 6 | EventCard utility (EventCard.tsx:110) | Dies into Index Row. | Civic lists are Index Rows on /events/civic. |
| 7 | EventCard compact (EventCard.tsx:154) | Dies into Index Row. | Nothing is lost. |
| 8 | EventCard feature (EventCard.tsx:254) | Dies into Plate. | The events lead is the screen's one Plate. |
| 9 | EventCard tile (EventCard.tsx:327) | Dies into Entry. | Rails render Entries. |
| 10 | EventCard glance (EventCard.tsx:416) | Dies into Index Row. | The time-first column becomes the row's left block. |
| 11 | EventCard row (EventCard.tsx:539) | Dies into Index Row. | Saved and venue lists use the same row. |
| 12 | SeriesCard (SeriesCard.tsx:32-157) | Dies into Index Row plus one Disclosure. | Occurrence expansion becomes the standard Disclosure, mounted on open. |
| 13 | TonightRail photo card (TonightRail.tsx:46+) | Dies into Entry with thumbnail. | The photo-rail form survives as Entries; no separate design. |
| 14 | AnswerCard (AnswerCard.tsx:54+) | Dies into Plate. | The /today lead is the canonical Plate. |
| 15 | TodayCard weather hero (TodayCard.tsx:131-188) | Dies; recast as the Conditions Line display primitive. | The weather overlay card disappears; one fixed conditions sentence opens the briefing (D-references.md pattern 9). |
| 16 | WeeklyCard (WeeklyCard.tsx:75-115) | Dies; recast as a Disclosure block. | Weather detail moves to MAY tier behind one Disclosure. |
| 17 | BetaIntroCard (BetaIntroCard.tsx:48-83) | Dies, no replacement. | Self-referential furniture costs a fold slot and serves no mode. |
| 18 | MoveStack itinerary (MoveStack.tsx:23-105) | Dies into the ItineraryList primitive (numbered Index Rows). | /plan's answer commitment is protected; the rendering standardizes. |
| 19 | WorthALook tile (WorthALook.tsx:40-74) | Dies into Entry. | Nothing is lost. |
| 20 | LocalNewsRail row (LocalNewsRail.tsx:58+) | Dies into Index Row with an external-source badge. | News moves to MAY tier on /today. |
| 21 | KnownForCard (KnownForCard.tsx:43-130) | Survives recast as the KnownForBlock detail block. | Place detail structure is protected; this is a data block, not a card. |
| 22 | BusinessExtrasCard (BusinessExtrasCard.tsx:36-86) | Survives recast into the FactsBlock detail block. | Protected content; the dl-row form merges with #23. |
| 23 | CivicCard (CivicCard.tsx:65-93) | Survives recast into FactsBlock. | Town civic data keeps its provenance footer inside one shared block. |
| 24 | MetricCard (MetricCard.tsx:69-184) | Dies with /rivers. | Gauges become a map layer and a conditions mention (section 1.c). |
| 25 | RadiusPresets card (RadiusPresets.tsx:31-36, 74-114) | Dies into RANGE chips. | A control should be a chip, not a 140px card. |
| 26 | Guide bento Tile (FunnelFlow.tsx:749-810) | Dies, no card replacement. | The Guided conversation replaces the bento; intent browsing lives in WHAT chips on /map and /places. |
| 27 | Guide town-door row (FunnelFlow.tsx:418-439) | Dies into Index Row. | The town door moves to /places "By town." |
| 28 | LiveDowntown sunset card (LiveDowntown.tsx:47-110) | Dies. | Its marquee job belongs to the screen's single Plate; three competing marquee cards violate the one-Plate rule. |
| 29 | Events mood tile (events/(list)/page.tsx:413-432) | Dies into WHAT chips. | Mood browsing becomes a chip rail, not a tile grid. |
| 30 | Places need tile (places/page.tsx:143-175) | Dies into WHAT chips. | Same anatomy rebuilt inline a third time (B-density.md line 122); chips absorb it. |
| 31 | Places category tile (places/page.tsx:284-318) | Dies into WHAT chips and Index Rows. | The category index becomes rows under the chip rail. |
| 32 | Who-to-call row (places/page.tsx:216-267) | Dies into Index Row. | It links to the surviving /contacts page. |
| 33 | MunicipalityStrip town card (today/MunicipalityStrip.tsx) | Dies into Index Row. | Thirteen towns render as 13 rows with a mono this-week count. |
| 34 | RadiusBuilder utility tile (RadiusBuilder.tsx:1135-1157) | Dies. | The 5 utility tiles' jobs move into the Layers checklist and map sheet rows. |
| 35 | RadiusBuilder event row (RadiusBuilder.tsx:1184-1222) | Dies into Index Row. | A parallel implementation of #7 stops existing twice. |

The 8 dead card designs in B-density.md section 2.2 die with their files in section 1.a. The gap closes: 35 designs become 3 cards plus 4 protected data blocks (HoursBlock, KnownForBlock, FactsBlock, ItineraryList), which are tables and lists, not cards.

### 1.e The duplicated search affordances: one implementation, two doors

Today the app ships two search UIs and stacks two affordances on one screen: the header pill opens SearchOverlay (search/SearchOverlay.tsx) while the /guide hero input links to the separate /search page, 180px apart (A-journey.md lines 52 and 130; B-density.md line 202). The search engine's result quality for real queries is protected; the duplication is not.

**Kills:**

1. **The /search page UI dies.** It duplicates the overlay with a different layout (A-journey.md line 38). It costs the user a second search interface to learn; nothing breaks because the URL survives as a shell rendering the single SearchPanel component, keeping `?q=` deep links alive.
2. **The header search pill dies** (TopBar.tsx:165-186, with chrome in section 1.g). It costs the user a competing affordance above every screen; what breaks is search-from-anywhere in zero taps, and the job moves to the Ask tab, whose input IS the search and the conversation opener, one tap away from every screen.
3. **The desktop keyboard hints rendering in the mobile overlay die** (A-journey.md line 34). They cost mobile users dead instructions; nothing breaks.
4. **The "DIRECT ANSWER" transit fallback for gibberish queries dies** (A-search-empty.png; A-journey.md line 131). It costs the user the ability to trust fullness because the search never admits emptiness; what replaces it is an honest empty state, and the fuzzy floor that returns a salon for "xylophone warehouse" is an engineering gate alongside it.

**Survival argument for the second door:** /places keeps a find-by-name input because a reference index without lookup fails its one job, but it renders the same SearchPanel scoped to places. One implementation, two doors, zero screens with two search affordances visible at once.

### 1.f The 13 non-primary vermilion spends: all 13 die

C-forensics.md section 4.3 lists every place `--app-brand` is spent on something that is not the screen's primary action. The new law is absolute: one vermilion element per screen, and it is the primary action. All 13 spends die; none has a survival argument, because a signal color that appears 13 extra times is wallpaper (D-references.md pattern 6).

| # | Spend (cite) | Replacement treatment |
|---|---|---|
| 1 | Active nav tab pill, glow, and icon (BottomNav.tsx:113-148; SideRail.tsx:98-133) | The active tab marks itself with ink weight and a filled icon; losing the glow costs nothing because position already says "you are here." |
| 2 | TopBar status dot (TopBar.tsx:142) | It dies with /pulse and the indicator (sections 1.c and 1.g); severe alerts get a banner, which is a state, not chrome. |
| 3 | Nearest-town marker in LocationChip (LocationChip.tsx:162) | The marker becomes ink-2; the chip itself leaves the chrome (section 1.g). |
| 4 | County pulse and Amenities icons in MoreSheet (MoreSheet.tsx:62,65) | They die with the MoreSheet (section 1.g). |
| 5 | Result count badge (FunnelFlow.tsx:348) | Counts are supporting detail (CLAUDE.md voice rule); the count renders in mono ink-3. |
| 6 | "Clear filters" and "go back" links (FunnelFlow.tsx:555,563) | Inline links become underlined ink; most die with the guide filter wall anyway. |
| 7 | "See all" rail link in brand-press (HiddenGemsRail.tsx:44) | Section links render in ink-2; the rail itself leaves the Ask front door. |
| 8 | Parking icon inside PlaceSheet (PlaceSheet.tsx:471) | The icon becomes ink-2; vermilion on the sheet belongs to its one action. |
| 9 | "See full page" footer link (PlaceSheet.tsx:567) | It becomes an underlined ink link; the sheet's primary action keeps the color. |
| 10 | Category fallback color (PlaceSheet.tsx:126) | Uncategorized places fall back to ink-3, never to the brand; a data gap must not borrow the primary signal. |
| 11 | RouteAccent re-tinting /today and /events (RouteAccent.tsx:26,32) | The component dies; its own comment states brand "is for the single primary CTA," and route-wide tinting contradicts it. |
| 12 | Brand-mixed eyebrow ink (.fg-eyebrow, globals.css:1853) | Eyebrows render in ink-3; 143 eyebrow instances (C-forensics.md section 2.1) stop bleeding accent everywhere at once. |
| 13 | Brand tone in the Pill API (ui/Pill.tsx) | The chip system's selected state is an ink fill; the brand tone leaves the API so no chip row can spend the accent again. |

Related but separate: the 49 hardcoded instances of the retired brand hex #A03A22 and the 3 phantom tokens (C-forensics.md section 2.4) are rendering wrong colors in production today; they are a Phase 4 sweep with founder approval, not a Phase 1 design kill, and this document only records them.

### 1.g The persistent chrome: 9 elements become 5

Today the chrome spends 9 always-on interactive elements before content renders: 4 in the header (wordmark, search pill, PulseIndicator, More menu, plus LocationChip from the sm breakpoint) and 5 nav tabs (A-journey.md line 11; B-density.md section 4.1). The budget is 5. The shell also offers 46 always-available navigation targets counting the drawers (B-density.md section 4.3).

**The 5 that remain:** the masthead wordmark (1) and 4 tabs: Ask, Today, Map, Saved.

**What the header loses (3 of its 4, plus the sm extra):**

1. **The search pill dies** (TopBar.tsx:165-186). Cost and destination are in section 1.e; the Ask tab absorbs the job at a cost of one tap.
2. **The PulseIndicator dies** (TopBar.tsx:206). It costs every screen a cryptic dot; what breaks is ambient alert visibility, and the job moves to the /today briefing plus a severe-alert banner that appears only when a real alert exists.
3. **The More menu dies** (TopBar.tsx:219-230; MoreSheet.tsx:61-81). It costs the user a 12-item junk drawer; what breaks is one-tap reach to 12 routes, of which 9 die or merge in section 1.c (/pulse, /plan promoted instead, /parking, /amenities, /contacts demoted to /places, /transit, /trails, /parks, /rivers) and 3 (/about, /trust, /settings) move to the footer.
4. **LocationChip leaves the chrome** (TopBar.tsx:235-237; LocationChip.tsx:121-174). It costs desktop users a 14-item dropdown on every screen; what breaks is one-tap town switching, and the job moves to the map center select and the /places "By town" rows.

The masthead survives as the Constant Band (D-references.md pattern 3): one fixed treatment, the same height and serif placement on every surface, doubling as the back affordance on detail pages exactly as TopBar.tsx:121-157 already behaves. A non-interactive masthead was considered to free a slot for a fifth tab and rejected, because a dead wordmark breaks a universal expectation.

**What the nav loses (1 of its 5 tabs):**

5. **The Events tab dies** (tabs.ts:48). It costs the user top billing for the heaviest sift wall in the app, roughly 320 rendered choices (B-density.md section 5.2), while the answer machine hides in an overlay (AUDIT.md offender 3); what breaks is one-tap access to the calendar for event-first locals, and the job moves to the /today briefing, which leads with tonight's events in its evening state and carries a permanent "Full calendar" link, plus event pins on /map under WHEN. The /events route itself survives (section 1.c).

The Saved tab survives over Events because the saved-places concept is protected, my-radius is the only screen in the app near budget with one clear primary (B-density.md line 232), and a personal library is a destination a user chooses, while a municipal calendar is a feed the app must editorialize before it deserves a tab again.

The AppFooter (AppFooter.tsx:17-23) is scroll-end furniture, not persistent chrome, and its link set becomes: About, Trust and data, Settings, Terms. The Terms link is the first inbound link that legally required page has ever had (B-density.md line 204).

---

## 2. Choice budget on paper

Before counts are first-viewport interactive elements from A-journey.md's table (lines 15 to 42). After counts use the grouping rule from A-journey.md line 9, and chrome costs every screen 2 of its 5 groups: the masthead (1) and the tab bar (1). Raw element counts after reduction are estimates an engineer must hold as ceilings. Every screen lands at 5 or fewer groups with exactly 1 primary action, named.

| Screen | Before: above-fold elements (A-journey cite) | After: choice groups (count) | Raw elements after | Primary action |
|---|---|---|---|---|
| home/guide (Ask) | 16 cold; 34 in the funnel (lines 17, 25) | masthead, nav, Ask input, starter-prompt chip row (4) | ~10 | The Ask input: type or tap a prompt and the conversation starts. |
| map | 19 collapsed; 29 with sheet open (lines 31, 32) | masthead, nav, filter rail (WHEN + WHAT + OPEN), map canvas with pins, lead-pick Plate in the collapsed sheet (5) | ~12 | The lead-pick Plate: "best near you right now," one tap to the place. |
| today | 25 (line 18) | masthead, nav, WHEN toggle, lead Plate, tonight's Index Rows (5) | ~13 | The lead Plate: the one move for this time state. |
| events | 22 (line 21) | masthead, nav, WHEN rail, lead event Plate, Index Row list (5) | ~14 | The lead event Plate. |
| places | 18 (line 27) | masthead, nav, find input, WHAT chip rail, Index Row list (5) | ~15 | The find input. |
| place detail | 18 (line 28) | masthead, nav, breadcrumb, Save button, action row (5) | ~11 | Save, the clearest primary in the app today (A-journey.md line 28), kept. |
| my-radius | 26 (line 29) | masthead, nav, plan-from-saved CTA, saved Index Rows (4) | ~10 | "Build an evening from these," seeding /plan from saved places; the empty state shows one sentence and one action (Open the map). |
| plan | 25 picker; 17 result (lines 40, 41) | picker: masthead, nav, setting toggles, mood cards (4); result: masthead, nav, itinerary, Share (4) | ~14 picker, ~9 result | Picker: tap a mood. Result: Share, the filled CTA, kept (A-journey.md line 41). |

Three structural notes. First, the before numbers fail mostly because of chrome and duplicated affordances, so sections 1.e and 1.g do half the work of this table by themselves. Second, the today and map leads may not ship until AUDIT.md blocker 1 (ranking trust) is fixed, because a Plate that promotes a funeral home is worse than no Plate. Third, every count that renders in any group must come from the unified query with one predicate (AUDIT.md blocker 2), or it does not render.

---

## 3. The consolidated component census

The post-reduction library is 31 components, down from 253 files (B-density.md section 1.1). The 22 marketing-scene components remain quarantined under `src/components/marketing/` for /pitch and are outside this census. Every entry lists its one job and its descent.

**The 3 cards (3):**

1. **Plate.** The one hero answer per screen: eyebrow, serif name, verdict line, status word, mono detail line, one action, optional treated photo. Absorbs PlaceCard feature and answer, EventCard feature, AnswerCard, TonightRail, LiveDowntown (B-density.md section 2.1, #4, 5, 8, 13, 14, 28).
2. **Entry.** The standard listing card for rails and grids: name, verdict, mono detail, optional thumb, whole-card tap. Absorbs PlaceCard row, grid, tile, EventCard tile, WorthALook (#1, 2, 3, 9, 19).
3. **Index Row.** The one-line dense-list unit: left status or date block, name, right-aligned mono detail. Absorbs EventCard utility, compact, glance, row, SeriesCard, LocalNewsRail row, town rows, who-to-call row, RadiusBuilder event row (#6, 7, 10, 11, 12, 20, 27, 32, 33, 35).

**The button system (1):**

4. **Button.** One file, three variants (primary, quiet, destructive) and an icon slot; the only component allowed to render vermilion. Absorbs ui/Button, SaveButton, MyRadiusButton, ShareButton, BeenHereToggle, EventCalendarButton, whose behaviors become actions passed to Button (B-density.md section 1.1 CTA class).

**The sheet system (1):**

5. **Sheet.** One bottom-sheet implementation with snap points and a full-screen mode. Absorbs ui/Sheet, BottomDrawer, MapControlSheet, PlaceSheet, and the SearchOverlay container (B-density.md section 1.2 lists the 7 coexisting implementations); MoreSheet dies outright (section 1.g).

**The chip system (1):**

6. **Chip.** One tappable token with selected and unselected states and no brand tone (section 1.f, #13). It renders all four surviving vocabularies (WHEN, WHAT, OPEN, RANGE) and absorbs Pill, FilterChip, Segmented, Chip, MapIntentChips, MapTimeChips, TimeToggle, RadiusPresets (B-density.md sections 1.2 and 3.1).

**Navigation (5):**

7. **Masthead.** The Constant Band: fixed-height serif band naming the surface or locality, identical everywhere, back affordance on detail pages. Descends from TopBar (TopBar.tsx:121-157) stripped of pill, indicator, and More.
8. **TabBar.** The 4 mobile tabs from the single source of truth in tabs.ts.
9. **SideRail.** The desktop rendering of the same tabs.ts source.
10. **AppFooter.** Scroll-end links: About, Trust and data, Settings, Terms (revised from AppFooter.tsx:17-23).
11. **Breadcrumb.** Place-detail ancestry, kept as is (places/[slug]/page.tsx:195-207).

**Inputs (4):**

12. **SearchPanel.** The one search implementation: input, honest empty state, results; rendered by the Ask tab, the /search shell, and the /places find door (section 1.e). Descends from SearchOverlay and SearchInput.
13. **PlanBuilder.** The protected Guided-mode terminal: settings toggles, mood picker, committed itinerary (plan/PlanBuilder.tsx).
14. **LocationAutocomplete.** Address and place lookup for forms and the map center select.
15. **FormField.** One labeled field set serving SubmitEventForm, SubmitPlaceForm, and ClaimForm, which become route-level compositions rather than census entries.

**Display primitives (16):**

16. **MapCanvas.** The one Mapbox surface, pins and overlays included, with a static mini variant for detail pages; absorbs AppMap, RadiusMap, AppMapDeck rendering, and MiniMap.
17. **StatusWord.** The controlled status vocabulary ("Open now," "Closes soon," "Closed, opens 8 AM," "Dark tonight"), rendered identically everywhere (D-references.md pattern 9); absorbs OpenClosedDot, PlaceStatus, LiveDot.
18. **ProvenanceLine.** One source-and-freshness line ("Official · Confirmed 1h ago"); absorbs SourceBadge, TrustChip, FreshnessChip.
19. **ConditionsLine.** The fixed opening sentence of /today: weather, daylight, one county note; replaces TodayCard and SkyHero's hero job.
20. **VisitStrip.** The fixed-order briefing strip atop place detail: status with next transition, travel time, parking note, one fallback line (D-references.md pattern 10).
21. **ItineraryList.** Numbered Index Rows with times and distances; the /plan answer body, descending from MoveStack.
22. **HoursBlock.** The protected hours table with its source citation (place detail).
23. **KnownForBlock.** The protected "what people say" block, descending from KnownForCard.
24. **FactsBlock.** Provenance-footed dl rows merging BusinessExtrasCard and CivicCard.
25. **AlmanacLine.** One curated almanac sentence per place and town, set in the data style, sourced from the overrides file (D-references.md pattern 1).
26. **Disclosure.** The one progressive-disclosure container, which mounts children only on open, ending the pattern where CollapsibleSection ships hidden HTML (B-density.md line 3; CollapsibleSection.tsx:112-114).
27. **SectionHeading.** One heading row with an optional single trailing link.
28. **EmptyState.** One honest empty pattern: one sentence, at most one action.
29. **Skeleton.** One loading placeholder set.
30. **Lightbox.** Full-screen photo viewing, descending from PhotoLightbox.
31. **Photo.** The treated-image wrapper enforcing the AUDIT.md blocker 4 standard, with the typographic fallback built in.

Everything in `src/components/` not named above and not in section 1.a's relocation list dies or dissolves into route-level composition of these 31.

---

## 4. Content hierarchy rules

These rules are the law for Phase 2 prototypes. Three tiers govern every screen: MUST content renders by default, MAY content sits exactly one intentional disclosure away, and CAN-REQUEST content sits behind explicit navigation. Two global laws precede the archetypes. First, a disclosure mounts its content when opened and never ships it hidden in the initial HTML, because the 320-choice events page was built one hidden tier at a time (B-density.md line 3). Second, every count that renders anywhere comes from the unified query with the verified-open predicate, and counts render in the mono data style as supporting detail, never as a headline (AUDIT.md blocker 2; CLAUDE.md voice rules).

### The answer screen (today, the guide answer, the plan result)

The user MUST see one conditions or context line, one lead answer as a Plate with its verdict line, its status word, its mono detail line, and its single action, and one fallback line naming the plan B (D-references.md pattern 10). The lead is chosen by a time-state machine, and no answer renders that the clock contradicts: no 7:30 PM movie after 9 PM, no 230-minute itinerary starting at 11 PM, and no evening lead on a Saturday morning (A-journey.md lines 108 and 83). The user MAY see, behind one disclosure or one scroll boundary, two alternates in Entry form and the current WHEN slice of events as Index Rows. The user CAN REQUEST the full calendar, the full open-now map, and the weather detail through explicit links. If the ranking layer cannot certify the lead (AUDIT.md blocker 1), the screen renders the conversation or the map instead of a junk Plate, because an empty slot is honest and a wrong slot is fatal.

### The list screen (events, places index, my-radius)

The user MUST see at most one Plate as the lead, then a single column of Index Rows or Entries in one fixed anatomy, with one chip rail (WHEN or WHAT, never both rails at once) above the list. The list renders at most 12 items before a Disclosure labeled with the exact count of what it holds, and no item ever renders twice on one page (A-journey.md line 106). The user MAY see, one disclosure away, the next tier of the same list and one refinement sheet carrying the remaining facets. The user CAN REQUEST the civic and municipal calendars at /events/civic, the month calendar at /events/calendar, and per-town pages, each through one explicit link. Editorial filtering happens upstream in the pipeline (normalize.ts, per the protected architecture), so the discovery list never contains yard-waste pickups or officials rosters for the user to sift (AUDIT.md blocker 3).

### The detail screen (place detail, event detail; structure protected)

The user MUST see the name, the VisitStrip in its fixed order (status word with next transition, travel time, parking note, fallback line), the one primary action (Save on places, the calendar action on events), one ProvenanceLine, and the verdict line where an editorial pick exists. The reading order is identical on every detail page in the app, so the eye never searches (D-references.md pattern 10). The user MAY see, each behind its own single disclosure or below the first scroll boundary in the protected order, the hours table, the KnownForBlock, the FactsBlock, the photo set, the AlmanacLine, and near-here suggestions. The user CAN REQUEST the category index, the town page, sharing, and reporting through footer links. Nothing on a detail page links to a second recommendation surface above the primary action, because the destination layer already works and must not inherit the journey layer's clutter (AUDIT.md "What holds up").

### The map screen (the Fast-mode core)

The user MUST see the canvas with pins drawn from the same unified query as every count, one filter rail carrying WHEN, WHAT, and OPEN as a single chip group, and the collapsed sheet holding exactly one lead-pick Plate. The map answers "what is good near me right now" with zero taps by rendering time-aware pins and the lead pick on arrival. The user MAY see, by raising the sheet one snap, the RANGE chips, the in-view places as Index Rows, and the Layers checklist holding amenities and overlays in one flat list. The user CAN REQUEST GIS overlays via `?layers=` deep links and whole-county scope as the final RANGE stop. The map never renders a second control strip outside the sheet (the leak in A-journey.md line 135), never marks more than one element in vermilion, and never shows a count that the open-now predicate has not produced.

---

*End of Phase 1 deliverable. Phase 2 prototypes both direction hypotheses against these budgets and laws; nothing in this document ships as code without founder approval.*
