# A. Journey audit of frederickradius.app

Agent A, Journey Cartographer. Phase 0 forensic audit. Zero code changes were made.

## Method

I walked the production app at https://frederickradius.app in a Playwright Chromium context at 390x844, mobile emulation, 2x scale, with 8 to 12 seconds of settle time per page. The app clock read Thursday, June 11, 11:08 PM Eastern at the start and 11:36 PM at the end. All findings describe the live app in that window. Where a persona's stated time differs from the audit time, I assess the structures that exist and mark what I could not verify.

Interactive counts use the specified DOM query: `a[href], button, input, select, [role=button], [role=tab]` filtered to elements intersecting the first 844px viewport with nonzero size and a non-null offsetParent. Word counts come from text nodes whose parent element intersects the first viewport. Choice counts group related controls (a chip rail is 1 choice, the 5-tab nav is 1 choice). All 26 screenshots live in `design-audit/screens/`.

One structural fact shapes every number below. The persistent chrome contributes 9 interactive elements to every screen: 4 in the header (logo, search pill, county-alerts pill, More menu) and 5 in the bottom nav. A 5-choice budget is spent before any content renders.

## Per-screen metrics

| Route / state | Screenshot | Interactive (1st viewport) | Choice groups | Words | Primary action | Budget verdict (max 5 choices, 1 primary) |
|---|---|---:|---:|---:|---|---|
| `/` cold (307 redirect to `/guide`) | A-home-cold.png | 16 | 5 | 62 | Hero search, but the header search pill duplicates it | FAIL: 16 > 5; two competing search affordances |
| `/today` | A-today.png | 25 | 8 | 93 | "See what's open" (red), but "See the weekend" is an identical red CTA | FAIL: 25 > 5; two primaries |
| `/today` scrolled 1 | A-today-scrolled.png | 27 | 7 | 150 | "Best move tonight" card | FAIL: 27 > 5 |
| `/today` scrolled 2 (page end) | A-today-scrolled-2.png | 26 | 6 | 143 | None committed | FAIL |
| `/events` | A-events.png | 22 | 6 | 117 | None committed; Best next card, Month link, and 7-day strip compete | FAIL: 22 > 5; no single primary |
| `/events` scrolled | A-events-scrolled.png | 12 | 2 | 108 | None committed (undifferentiated card list) | FAIL: 12 > 5 |
| `/events/summer-concert-series...` | A-event-detail.png | 16 | 5 | 123 | None visible in first viewport; action row sits below the fold | FAIL on primary visibility; content itself is calm |
| `/events/shred-event-2026-06-12` | A-event-detail-best-next.png | 17 | 5 | 83 | "Add to calendar" visible in a 3-button row | FAIL: 17 > 5 |
| `/guide?need=eat` (guide step) | A-guide-step.png | 34 | 7 | 106 | "Best match" card, below 20 filter controls | FAIL: 34 > 5; 16 cuisine chips plus 4 filters plus sort precede the answer |
| Guide best-match place card | A-guide-best-match.png | 47 | 6 | 167 | "Directions", diluted by 7 sibling actions | FAIL: 8 actions on one card |
| `/places` | A-places.png | 18 | 4 | 39 | Search field | FAIL: 18 > 5; otherwise the calmest hub |
| `/places/the-wine-kitchen-frederick` | A-place-detail.png | 18 | 6 | 65 | "Save" (unmistakable) | FAIL by count only; clearest primary in the app |
| `/my-radius` cold (empty state) | A-my-radius.png | 26 | 7 | 92 | None committed; the empty state points at a bookmark icon that exists elsewhere | FAIL: 26 > 5 |
| `/m/frederick` | A-town-frederick.png | 16 | 4 | 110 | Search field; the "Worth your time" carousel competes | FAIL: 16 > 5 |
| `/map` collapsed bar | A-map-default.png | 19 | 6 | 40 | None committed | FAIL: 19 > 5; second control strip leaks below the nav |
| `/map` sheet open (Adjust) | A-map-sheet-open.png | 29 | 7 | 86 | None committed; 3 quick picks, mode toggle, area select, fine-tune all compete | FAIL: 29 > 5 |
| `/map` pin card | A-map-pin-card.png | 27 | 6 | 100 | "Directions", diluted by Call, Park nearby, Website, Close, expand | FAIL |
| Search overlay (header pill) | A-search-overlay.png | 26 | 4 | 92 | Text input (clear) | FAIL: 26 > 5; desktop keyboard hints render on mobile |
| Search overlay, "date night" typed | A-search-results.png | 28 | 3 | 144 | "Plan tonight" action ranked first (good) | FAIL by count; best result quality in the app |
| Search overlay, gibberish query | A-search-empty.png | 21 | 3 | 89 | None; transit cards appear under a "DIRECT ANSWER" label | FAIL: no honest empty state |
| Search overlay, "xylophone warehouse" | A-search-fuzzy.png | 24 | 2 | 113 | None | FAIL: fuzzy match returns a salon and a battery store |
| `/search` page | A-search-page.png | 24 | 5 | 65 | Text input (clear) | FAIL by count; duplicates the overlay with a different UI |
| `/open-now` | A-open-now.png | 22 | 6 | 144 | None committed (8-card grid plus sort) | FAIL: 22 > 5 |
| `/plan` | A-plan-tonight.png | 25 | 5 | 146 | Mood cards, with explicit instruction "Tap one to build a plan" | FAIL by count; clear primary intent |
| `/plan` after 1 mood tap | A-plan-result.png | 17 | 4 | 86 | The plan itself; Share is the filled CTA | FAIL by count; the screen commits to an answer |
| `/plan` after "New plan" | A-plan-built.png | 25 | 5 | 146 | Mood cards (reset to picker) | FAIL by count |

Zero of 26 captured states meet the budget. The fixed chrome alone guarantees failure, but 14 of 26 states would still exceed 5 choices with the chrome removed.

## Persona 1: first-time tourist, Saturday morning

Question: "What should we do this morning?" Entry: cold open of the homepage.

### Journey narrative

The tourist opens frederickradius.app and the server 307-redirects to `/guide`. She lands on "What are you looking for?" above a search input and 6 need cards (Eat & drink 286 places, Coffee 86, Get outside 169, Shops & makers 316, Arts & culture 96, Take the kids 227). Nothing on this screen knows it is Saturday morning. The only time-aware element is the header pill "What's open right now?", which is a second search affordance 180px above the first one. The nav tab for this screen is labeled "Ask", so she does not know she is on the home screen.

If she taps "Get outside", she gets a funnel modeled on the eat funnel I captured: a filter wall, then a "Best match" card. The eat funnel's best match at audit time was Wolfe's Den, a bar at 6 W Water St, Smithsburg, MD 21783, labeled Thurmont, a 31-minute drive from the Downtown Frederick context the app itself displays, with "498 min walk" printed on the card (A-guide-best-match.png). If the morning equivalent behaves the same way, she follows a confident-looking answer out of the county. The card she lands on offers 8 actions (Directions, Call, Reserve, Order, Park nearby, Website, See full page, Share).

If she taps "Today" instead, the lead card promises "54 places open near downtown" and its CTA, "See what's open", delivers a page headed "15 places verified open against live hours". The number she tapped on shrinks by 39 with no explanation (A-today.png vs A-open-now.png). At audit time the first card on that list was "Sos Safe Ride", a designated-driver service categorized as Shopping, under a "Most loved" sort.

### Tap-depth map

| Tap | Screen | What happens | Risk |
|---|---|---|---|
| 0 | `/` redirects to `/guide` | Need grid, 2 search bars, no morning framing | HESITATE: which search? What is "Ask"? |
| 1 | Tap "Get outside" | Filter wall plus Best match | HESITATE: 20+ filter controls before the answer |
| 2 | Tap Best match card | Place overlay, 8 actions | BOUNCE RISK: best-match trust (eat equivalent was 31 min away); she opens Google to verify |
| 3 | Tap Directions | Hand-off to maps | Value, if the pick was right |

Minimum 3 taps to a directions hand-off. The number is fine. The problem is that the answer at tap 2 is not trustworthy enough to act on, so the real journey includes a detour through Google, which is a bounce.

Time-awareness gaps: the entry screen has no concept of morning. The "By the moment" module exists on `/guide` but sits below the fold, beneath 6 need cards. `/today` has Now, Tonight, and Tomorrow chips but no Morning shelf, and I could not verify its 9 AM state from an 11 PM audit window.

## Persona 2: date-night planner, Thursday 5 PM

Question: "Where do we go tonight?" Entry: homepage.

### Journey narrative

The app contains a purpose-built answer to this exact question: `/plan`, an itinerary builder headed "Plan an evening." with Date, 3 hr, and Starts now toggles. One mood tap returns a complete, committed answer: "An easy 3-hour evening. 3 stops for date night. Real places, nothing invented." with times, walking distances, and per-stop actions (A-plan-result.png). This is the best screen in the app, and the planner will probably never see it.

`/plan` is not in the nav. It is not on the `/guide` first viewport. It is not on the `/today` first viewport. The only routes I found to it are the QUICK START "Plan tonight" item inside the header search overlay, and the "Plan tonight" action that ranks first when a user types "date night" into that overlay. Both require the user to open search before the app reveals that it can plan.

The visible alternative is the guide funnel: tap "Eat & drink" on `/guide` and receive Wolfe's Den in Smithsburg as Best match. A date-night planner downtown taps the most prominent recommendation in the funnel and is told to drive 31 minutes.

The plan engine also ignores the clock. At 11:17 PM it built a 230-minute itinerary starting immediately, which ends near 3 AM. And one generated stop was "Downtown Community Room at Erucc", a church community room, slotted into a date plan between a restaurant and a pub. One junk stop poisons the whole itinerary because the user no longer believes the other 2.

### Tap-depth map

| Tap | Screen | What happens | Risk |
|---|---|---|---|
| 0 | `/` redirects to `/guide` | No mention of planning an evening | HESITATE: nothing names her job |
| 1 | Tap header search pill | Overlay with QUICK START "Plan tonight" | DISCOVERY GATE: she must guess that search holds the planner |
| 2 | Tap "Plan tonight" | `/plan` mood picker, Date toggle | Clear instruction, 1 decision |
| 3 | Tap a mood | Full 3-stop itinerary with times and distances | Value, minus trust damage if a junk stop appears |

Minimum 3 taps to a complete plan, which is excellent, but tap 1 depends on opening a search box with no planning intent advertised on it. The visible path (guide funnel) reaches an untrustworthy answer at tap 2 and likely bounces.

Time-awareness: at 5 PM Thursday the "Starts now" toggle and tonight framing would fit. At 11:17 PM the same flow happily planned 3.8 more hours, so the engine does not bound itself to a sane evening end.

## Persona 3: local resident, quiet Tuesday

Question: "Anything happening I do not know about?" Entry: `/today` or `/events`.

### Journey narrative

On `/events`, the page leads with "Best next: Shred Event, 9:00 AM, 1440 Taney Avenue". The single most prominent recommendation slot on the events surface promotes a document-shredding drop-off at a bare street address. The local's first impression is that the app cannot tell a concert from a chore.

Below it, the page runs 2,907px. The weekend events render twice: once under MUSIC, ARTS, and MORE THIS WEEKEND, and again under a "This weekend 12" section further down. "Coming up 47" mixes Sky Stage concerts and Juneteenth celebrations with Council Legislative Meeting, Planning Commission (twice), Board of Appeals, 3 separate Veterans Advisory Council entries, "Police Station", Yard Waste Drop Off, and Grass/Leaf Curbside Pickup. Unnormalized titles survive into cards: "Star Catcher LLC Crash the Limo" and a Summerfest listing that carries 2 sponsor names and a pipe character in its title. Many cards in MORE THIS WEEKEND show venue "Frederick" and category "EVENT", which tells a local nothing.

On `/today` at 11:08 PM, the "BEST MOVE TONIGHT" card promoted "Classic Cinema at the Weinberg, Tonight", linking to a series page, while the events list dates that screening 7:30 PM. At 11:08 PM no 7:30 PM movie is a best move for tonight; the slot served a stale or wrong-day answer. The Tomorrow chip surfaced the Shred Event a second time. The page also said "Late tonight. Soft, gray light over the county.", which describes daylight at 11 PM.

The good news for this persona is the event detail layer: the Summer Concert Series page is the cleanest screen in the app, with provenance ("Official", "Confirmed 1h ago"), a real description, and a useful what-to-know block. The failure is everything between the tab and that page.

### Tap-depth map

| Tap | Screen | What happens | Risk |
|---|---|---|---|
| 0 | `/events` | Best next = Shred Event | HESITATE: flagship slot is junk; trust drops immediately |
| scroll x3 | 2,907px list | Weekend events duplicated; 47-item list salted with civic meetings and waste pickup | SIFT WALL: the unknown-but-good event hides among 70+ cards |
| 1 | Tap an event card | Detail page with provenance and what-to-know | Value, 1 tap but 3 screens of sifting late |

Minimum 1 tap to value, but only after the heaviest scroll-and-sift cost in the app. The local's question is "surprise me with the good thing", and the feed answers with the unfiltered municipal calendar.

Time-awareness: the Now, Tonight, and Tomorrow chips are the right structure. The contents fail at the edges: "tonight" does not expire after events start, and nothing distinguishes a Tuesday lull from a Saturday peak.

## Hesitation and bounce points, ranked by severity

1. **Junk in every flagship recommendation slot.** Best next = Shred Event (`/events`). Worth your time in Downtown Frederick = Cruise Holidays travel agency, then a wig shop, a school, a children's chorus, and Keeney and Basford Funeral Homes, all categorized Shopping (`/m/frederick` DOM dump). Most loved open place = Sos Safe Ride (`/open-now`). Guide Best match = a bar 31 minutes away in a Washington County zip code, captioned "498 min walk" (A-guide-best-match.png). Date plan stop = a church community room. Every surface that says "trust me" presents at least 1 disqualifying pick, and 1 is all a user needs to stop trusting the rest.
2. **Numbers contradict each other within minutes.** 54 open (`/today`, 11:08 PM), 29 open (`/map` radius bar, 11:12 PM), 15 verified open (`/open-now`, 11:16 PM). The guide card says Eat & drink has 286 places; the funnel one tap later says "24+ places". A user who taps a number and receives a smaller number stops believing both.
3. **The events feed is an unfiltered municipal calendar.** Civic meetings, fitness classes, and waste-collection notices sit inside the discovery list, weekend events print twice on one page, and titles ship with LLC names and sponsor strings. The sift cost lands on the persona least willing to pay it.
4. **Stale and unbounded time logic at night.** "Best move tonight" pointed to a 7:30 PM movie at 11:08 PM. The planner built a 230-minute itinerary starting at 11:17 PM. Copy described "soft, gray light" in darkness. The structures (Now, Tonight, Tomorrow, Starts now) exist; the contents do not respect the clock at the boundaries.
5. **The best tool is hidden and the entry screen answers no question.** `/` redirects to `/guide`, a browse hub labeled "Ask" in the nav, with 2 stacked search affordances that open 2 different search UIs (header overlay vs the `/search` page the hero input links to). `/plan`, the screen that produces a complete answer in 1 tap, is reachable only through the search overlay.
6. **Search will not say no, and matches loosely.** A gibberish query returns transit cards labeled "DIRECT ANSWER" (A-search-empty.png). "Xylophone warehouse" returns Sam Wong Salon among 5 matches (A-search-fuzzy.png). A search that never admits emptiness teaches users not to trust its fullness.
7. **Chrome spends the entire choice budget.** 9 fixed interactive elements (4 header, 5 nav) precede content on all 26 states; zero screens pass the 5-choice budget.
8. **Action overload on place cards.** The map pin card and guide best-match card present 7 to 8 actions each (Directions, Call, Reserve, Order, Park nearby, Website, See full page, Share); the place detail page shows the same place can work with 1 primary (Save) plus 2 map hand-offs.
9. **The what-to-know module decorates without checking itself.** Court Street Parking Deck is claimed at 329 ft from Baker Park Bandshell and 427 ft from 1440 Taney Avenue, venues roughly 0.5 to 1.5 miles from that deck; the distances appear to be measured from a fixed downtown origin. The same module advises "Eat before at Cafe Anglais British Tearoom" for a 9 AM paper-shredding drop-off.
10. **Visual defects and brand violations in production.** The collapsed map state leaks a second control strip (area select plus locate button) below the tab bar at y=823 (sliver visible in A-map-default.png). Desktop keyboard hints (navigate, open, esc) render inside the mobile search overlay. Em dashes appear in live user-facing copy despite the product's own rule: the town hero tagline ("Spires, brick, water" followed by an em dash), the site footer, and the weather line on event details. The concert detail prints the date range "SUN, JUN 14" twice for a 1-day event.

## What holds up

Three layers earn their keep and should anchor the redesign rather than be rebuilt. The place detail page (A-place-detail.png) commits to 1 primary action, shows an honest closed state with reopening time, and cites its hours source with a confirmation date. The event detail page (A-event-detail.png) carries provenance and 1 calm column. Typing "date night" into search returns 11 relevant places plus the Plan action ranked first (A-search-results.png). The destination layer works; the journey to it is what fails.

## The 5 worst journey failures

1. **Flagship slots promote junk.** "Best next" is a paper-shredding event and the top "Worth your time" pick in Downtown Frederick is a travel agency trailed by a funeral home, so the first recommendation a user reads disqualifies all the others.
2. **The Best match drives users out of the county.** The eat funnel's single confident answer is a Smithsburg bar a 31-minute drive away, printed with "498 min walk", for a user the app itself places in Downtown Frederick.
3. **The counts disagree wherever they meet.** 54 open became 29 became 15 across 3 screens in 8 minutes, and 286 places became "24+" across 1 tap, which converts every number in the UI from a promise into a guess.
4. **The 1-tap answer machine is unfindable while a 47-item sift wall is a nav tab.** `/plan` resolves the date-night job in 3 taps but hides behind a search overlay, while `/events` greets locals with duplicated weekend lists and yard-waste pickups.
5. **The app does not respect the clock at the edges.** It sells a 7:30 PM movie as "tonight" at 11:08 PM, starts a 230-minute evening at 11:17 PM, and offers no morning shelf to a Saturday tourist, so the core promise of a time-aware local guide fails exactly when a user tests it.
