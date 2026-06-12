# Site Capture: Verified Ground Truth

Captured from production on **Friday, June 12, 2026 at 4:11 PM ET** with a mobile user agent. This file exists so no session re-audits the site. If production has visibly changed since this date, re-run `scripts/budget.sh` and note deltas in `docs/BASELINE.md`; do not re-derive the findings.

## Routes

| Route | Status | Note |
|---|---|---|
| `/` | 200 | Byte-identical to `/guide` (confirmed by hash). Title "What are you after?" |
| `/guide` | 200 | The Ask tab target. Same page as root. |
| `/today` | 200 | Second landing experience. |
| `/events` | 200 | Dual-system page. |
| `/map` | 200 | Map view. |
| `/radius` | 200 | Serves the identical map view; twin route. |
| `/pulse` | 200 | Reached from an unlabeled header icon. |
| `/ask` | 404 | Dead; the tab labeled Ask points at `/guide`. |
| `/my-radius` | tab target | Saved. |
| Others | | `/nearby?c=…`, `/places`, `/places/[slug]`, `/towns`, `/collections/…`, `/transit`, `/events/calendar`, `/about`, `/trust`, `/submit`, map modes via `?mode=browse`, `?mode=radius`, `?open=now`, `?intent=parking`. `www` 308s to apex. |

## Budgets at capture

| Page | Visible text lines | Decoded HTML | Scroll depth (~35 lines per phone screen) |
|---|---|---|---|
| `/` | 50 | 157 KB | ~1.4 screens |
| `/today` | 310 | 326 KB | ~9 screens |
| `/events` | 951 | 788 KB | ~27 screens |
| `/pulse` | 122 | 194 KB | ~3.5 screens |
| `/map` | ~60 | 126 KB | canvas page |

The 788 KB on /events matches the June 9 audit's finding (922 KB of inline RSC data was the driver); that fix had not landed as of this capture.

## Verified duplications

- **"Miscast Cabaret" is named four times on /today:** in the "What's on Tonight" block, as "Best bet" in the Tonight module, as "Don't miss" in the Weekend module, and as a standalone event row with an OpenTable button. It appears twice more on /events (Best tonight, then again in the browse list).
- **The open-now intent has four entry points:** the header button "What's open right now? ⌘K" on every page, the "195 places open near downtown" stat card on /today, the "See what's open" link, and `/map?mode=browse&open=now`.
- **Three search affordances on /events:** input "Search events, venues…", input "Search story time, market, council…", plus the global ⌘K.
- **Count contradictions on /events, same screen:** editorial "This weekend 13 events" vs browse section "This weekend 12, Show all 12"; editorial "Later this week 12" vs browse "11"; browse header "76 upcoming" vs town chips "All 80".
- **Navigation:** the tab bar (Ask, Today, Map, Events, Saved) renders twice in the DOM on every page. The utility nav (About, Trust & sources, Towns, All places, Events, Suggest a correction) repeats Events. Eleven nav destinations total before any chips.
- **/map and /radius** render the identical view and controls (Fit radius, Show whole county, Map layers, Use my location).

## /today module inventory at capture (order as rendered)

Date/time header; 7 category chips (Coffee, Ice cream, Food, Pizza, Sweets, A drink, Fresh air); "Open now, 195 places" stat card with "See what's open" and "All places"; time tabs (Now, Tonight 1, Tomorrow 6, Weekend 13); What's on Tonight with the event card; weather block with four affordances (full briefing, hourly, 7-day, more details); Quick handoffs (ParkMobile); Tonight module ("1 event tonight, Best bet…"); Weekend module ("13 this weekend, Don't miss…"); Parking downtown and MARC rows; event row with OpenTable button and a ParkMobile/OpenTable explainer paragraph; "From above" drone book promo; Worth a look today, 6 picks (Rosati's Pizza, Gravel and Grind, Carroll Creek Amphitheater, Wag's, Clue IQ, The Little Pottery Shop); Heads up Heat Advisory (NWS, until 8 PM); "Best move now, duck inside"; "Tonight, 1 starting soon"; "Near you, within a 10-min walk"; An afternoon plan (K Town Takeout 15m, Gaslight Gallery 3m, Voila 1m); forecast strip (94° to 71°, storms 3 to 8 PM).

## /events structure at capture

System A, editorial: H1 "What's worth going to?"; Best tonight; date strip F12(1) S13(6) S14(6) M15 T16(0)…; More tonight; Happening soon (8); This weekend (claims 13); Browse by mood; Later this week (claims 12). System B, browse: "Browse & search all events, 76 upcoming"; search input one; 7 chips (Today, This weekend, Live music, Free, Happy hour, Family, Civic); 4 view modes (List, Compact, Agenda, Map); Filters plus Sort; search input two; the list (Today 1, This weekend 12, Later this week 11, Show all 51); town chips (All 80, Frederick 30, Frederick County 25, Thurmont 14, Mount Airy 10); civic cluster (Civic meetings 7, Civic & municipal calendar 225 series); Submit it.

## /pulse at capture

"1 situation across the county" header; five empty rows (Fire & rescue 0 clear, Traffic 0, Power 0, Schools 0, 311 0); Heat Advisory with a 34-jurisdiction region list; Frederick Scanner embed; USGS river gauges; In the news (6 items); police calls-for-service explainer; "By the numbers" census block (population 285,464; 663 mi²; founded 1748; 12 municipalities; 177 parks; 321 eat and drink; TransIT routes rendering as a dash; Carroll Creek 1.4 mi; Catoctin 1,888 ft).

## Other verified facts

- robots.txt blocks AI crawlers; the site is unreachable through search-grounded fetching (confirmed by failure during this audit; access required a raw client).
- All six hidden gem cards on the root displayed a Closed state at 4:11 PM on a Friday.
- A direct competitor exists: Frederick Happenings (app stores), events-only, community-powered, recently updated with mood filters and a redesigned nav.
