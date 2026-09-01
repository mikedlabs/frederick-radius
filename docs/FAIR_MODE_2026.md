# Frederick Radius Fair Mode 2026

Status: implementation brief  
Owner: Frederick Radius  
Fair dates: September 18 through September 26, 2026  
Target: useful public release before September 18, with field verification before promotion

## The opportunity

The Fair already attracts the audience Radius wants: Frederick County residents making a time-sensitive local decision together. The Fair describes itself as Frederick County's largest single annual event, averaging about 230,000 visitors across nine days. That makes Fair Mode both a public-service opportunity and Radius's strongest concentrated local acquisition window of the year.

The useful product is not another directory and not another app-store download. It is a fast, no-account answer to two questions:

1. What should we do next?
2. How do we get there?

If Radius answers those questions well at the Fair, people have a reason to keep it for the rest of Frederick County after September 26.

The product promise is:

> Frederick Radius helps you decide what to do next at the Fair, find it quickly, and keep discovering Frederick after the Fair is over.

## What the Fair offers now

The Fair relaunched a MeetingPlay native app in 2017. It included a schedule, interactive map, vendor locations, favorites, GPS wayfinding, notifications, social feeds, and a photo booth. The 2026 Fair site does not currently promote an App Store or Google Play download.

The current attendee stack is:

- the official Fair website for policies, prices, parking, guest services, and a long HTML schedule;
- Etix for admission, carnival, and grandstand purchases;
- an EventHub mobile guide for the floorplan, exhibitors, schedule, sponsors, and notifications;
- PDF and image materials for some maps and guides.

That stack has real strengths. It is official, the EventHub vendor map has booth assignments, the schedule is detailed, basic access does not require a native install, and EventHub event records support favorites. Radius should not pretend those useful parts do not exist.

It also leaves the attendee to assemble a trip across separate systems. In the public 2026 interface we could inspect, there was no visible end-to-end Fair plan that combines schedule items, foods, vendors, services, parking, and a route. We also found no visible offline Fair pack, nearby-next suggestions, saved-car recall, lightweight group plan, item-level food search, or first-class accessibility layer.

The live EventHub pages also carry avoidable mobile cost. The exhibitor response was roughly 3.78 MB and rendered about 310 listings for about 155 unique exhibitors. The schedule response was roughly 9.74 MB and rendered about 816 cards for about 204 distinct records, with many one-off events repeated four times. At a 390-pixel phone width, the landing page clipped horizontally and the schedule date strip overlapped. The map is split into three vendor-oriented sections rather than one attendee wayfinding view. No service worker, installable manifest, or documented offline mode was observed.

### Current evidence

- Official Fair home: https://thegreatfrederickfair.com/
- Official 2026 schedule: https://thegreatfrederickfair.com/schedule/
- Official admission and parking: https://thegreatfrederickfair.com/come-to-the-fair/
- Official vendor page and current EventHub link: https://thegreatfrederickfair.com/vendors/
- Official guest services: https://thegreatfrederickfair.com/guest-services/
- Current EventHub mobile guide: https://mobile.eventhub-floorplan.net/?Show_ID=18209
- 2017 native-app announcement: https://www.prweb.com/releases/download_the_great_frederick_fair_mobile_app/prweb14665925.htm

No current Fair-specific app-store listing was found during the September 1 audit. The legacy Android package returns a Google Play 404, Apple's current software search returns no Fair app, and the Fair site has no store links. There is consequently no honest current Fair-app rating, version, or review count to report. This is strong evidence that the native app is no longer the public offer, but it does not prove that every old installed copy has ceased to function.

- Legacy Google Play package: https://play.google.com/store/apps/details?id=the.great.frederick.fair&hl=en_US&gl=US
- Current Apple software search: https://itunes.apple.com/search?term=Great%20Frederick%20Fair&country=us&entity=software

## What attendees value and where the friction is

Recent venue reviews consistently praise the animals, agricultural education, food, clean grounds, family activities, and affordable advance admission. Recurring friction includes cash-only moments, food and game prices, traffic and lines, unclear re-entry expectations, and mobility or restroom access during crowded grandstand events.

Small, self-selected Frederick discussion samples point to the same product jobs. First-time visitors ask other residents to locate particular foods, attractions, and vendors; people ask where to park despite an official parking page; and entertainment timing or seating remains unclear. One local-app discussion made the adoption constraint plain: people want the useful website without another single-event install.

- Fair food and location questions: https://www.reddit.com/r/frederickmd/comments/1ngthtu
- Fair entertainment questions: https://www.reddit.com/r/frederickmd/comments/1l7vibg
- Fair parking questions: https://www.reddit.com/r/frederickmd/comments/1fknj6i
- Local app versus website discussion: https://www.reddit.com/r/frederickmd/comments/1je88lb

The strongest competitive pattern comes from Minnesota. Its independent fair guide is currently rated much more highly than the official app, although the review counts differ and this is directional evidence rather than a controlled comparison. Reviewers repeatedly value downloaded offline data, food and dietary filters, a simple wishlist, and directions to a saved item.

Radius should win on decision support and movement, not on the number of menu items.

## Product shape

Fair Mode lives inside the existing Radius product. It does not add a fifth primary navigation tab. The existing canonical Fair moment remains the parent:

`/moments/great-frederick-fair-2026`

An optional `/fair` route may redirect to that canonical page so QR codes and spoken instructions stay simple.

The page should feel like Radius at the Fair, not a reskinned fair website. Radius identity comes first. Until there is an official partnership, the page must be plainly labeled as an independent guide using official, attributed sources. Fair marks and protected artwork require permission.

### The first screen

The first screen should answer the visitor's immediate situation:

- what is happening now and in the next 45 minutes;
- the best nearby options for the interests they selected;
- one-tap access to their saved Fair Plan;
- the current official notice and its timestamp;
- map, parking, accessibility, food, and ticket shortcuts;
- when the local Fair pack was last updated.

It must remain useful in bright sunlight, on a small screen, with large text, and during weak cellular service.

## Signature experience

Fair Mode should feel like a live field program, not a dashboard and not a Fair-themed microsite. Its signature is a paired **Time Ribbon and Route Thread**:

- the Time Ribbon answers what is happening now, what starts next, and what is still worth doing;
- the Route Thread carries the visitor from an arrival choice to a gate, through the grounds, and back to the same departure mode;
- a one-time Gate Ripple can resolve a scanned gate or lot context without requesting GPS;
- My Fair Plan keeps the chosen stops, meeting point, return point, and offline pack on the device.

The stable in-page rail is `Now · Find · Plan · Leave`. Fair Mode stays owned by the existing Today surface and does not become a fifth global tab. A selected event, vendor, or facility may use the existing detail-sheet action pattern, but the Fair workspace must not replace the global navigation.

### Visual language

The visual system remains Radius first: Cream and Ink for the field-program surface, Brick for the primary action, Creek for arrival, transit, and leaving, Amber only for a current or starting-soon state, Forest for agriculture and grounds, and Plum only for grandstand or arts context. Libre Caslon Display may appear once in the Fair title. Public Sans carries every time, date, control, fact, and route instruction.

The composition uses date plates, ruled program rows, strong source stamps, tabular times, and one approved Fairgrounds image. It must not use a new Fair logo, carnival-poster decoration, glass effects for critical information, or a grid of generic feature cards.

Motion should explain a state change:

- the Gate Ripple resolves once in 240 to 420 milliseconds;
- the Amber Now notch moves only after a material time refresh;
- the Creek Route Thread draws once only when the route is verified;
- saved actions may reuse the existing one-shot ring and haptic;
- reduced-motion mode swaps every effect for the resolved static state.

No confetti, looping bounce, parallax, autoplay, or animated background is needed. The fun comes from seeing the day and route become clear.

### Screen hierarchy by situation

**Before arrival**

1. `Independent Radius guide · Official Fair sources · checked [time]`.
2. Fair open or closed state and date.
3. `How are you getting there?` with Drive/Parking, ADA shuttle, Drop-off, Transit, and Already here.
4. Only the sourced payment, entrance, stop, or shuttle facts for the chosen mode.
5. One primary action and a thin preview of the next program items.

**At a gate or inside**

1. Optional gate context set by a QR or a direct user choice, with `no GPS used` stated plainly.
2. One best next thing, its time, place, and access status, followed by two honest alternatives.
3. The nine-day Time Ribbon with exact, approximate, open-ended, and unpublished times represented differently.
4. Four flat tasks: Find food or an item, Restrooms and help, Accessibility, and My Plan.
5. Nearby results only after a foreground location request, a selected gate, or an approved placement QR.

**Leaving**

1. The saved return target, such as Lot D, Gate 3, or a selected transit stop.
2. One directions or official-departure action.
3. A source time and a plain statement when capacity or ETA is not available.
4. Only after the return plan is clear, an optional Frederick follow-on such as dinner, coffee, a hotel, or the next day's local plan.

**After September 26**

1. State plainly that the Fair has ended.
2. Lead to what is happening today in Frederick.
3. Continue only canonical saved businesses, performers, farms, and places into regular Radius.
4. Let the visitor keep, export, or clear the Fair plan and offline data.

### Accessibility and family lenses

Accessibility is a first-class journey, not a filter hidden under Map. It begins with parking, unloading, the Lot D ADA shuttle, mobility rentals, Family Care, and help. Every operational claim must say `Known` or `Not published`, include the source and checked time, and avoid calling a path accessible until it has been field-verified.

The family lens changes recommendations without creating child profiles. It can prioritize family-relevant schedule items, care, restrooms, quieter options, and meeting points, but it stores no child names or ages. Both lenses need 44-pixel targets, 200 percent reflow, logical screen-reader order, text and icon status in addition to color, and an equivalent list for every map action.

## Radius data that makes Fair Mode stronger

The advantage is not one Fair dataset. It is the way existing Radius sources make a Fair decision more complete without forcing the visitor through separate products.

| Visitor decision | Radius input | Fair use | Trust boundary |
|---|---|---|---|
| What should we do next? | Official Fair schedule adapter, Radius events, saved interests | Now, next, later, conflicts, and short plans | Official rows keep exact source labels; no invented time |
| Should we change the plan? | NWS forecast and alerts, daylight, heat and precipitation | Weather-aware indoor, outdoor, shade, and departure suggestions | Safety notice links to the official publisher |
| How do we arrive? | Fair parking facts, Frederick TransIT GTFS and GTFS-RT, MARC, MDOT CHART incidents | Drive, drop-off, accessible arrival, bus connection, and traffic context | No live lot, shuttle, or queue claim without an authorized feed |
| How do we move inside? | Approved Fair map, verified path graph, explicit foreground location | Gate-to-destination steps and nearby results | No straight-line walking or inferred accessible path |
| Where is food or help? | Approved vendor data, facilities, OSM amenities, Radius search | Item-level food, restroom, water, care, first-aid, and ATM finding | Vendor allergen or price claims remain vendor-attributed |
| What should we remember? | Device-local Fair Plan, current Saved patterns | Events, vendors, meeting point, car or gate note, and return path | Saved on this device; no continuous location history |
| What happens after the Fair? | Radius places, hours, farms, performers, events, downtown discovery | Keep the useful vendor or place and continue around Frederick | Only canonical, current Radius entities continue |
| What needs improvement? | Bounded anonymous outcomes and moderated community reports | Zero-result terms, wrong turns, stale facts, and missing amenities | Community status stays labeled and never becomes safety authority |

Air quality is intentionally outside this first slice. The current AirNow migration can be completed separately without blocking the core Fair journey.

### Transit evidence as of September 1

The current county GTFS names `East Patrick Street at Fairground Center` as stop `162918`. It is adjacent to the Fairgrounds and the current feed associates it with the 15 Connector and East Frederick Shuttle. Frederick County Transit is fare-free. The live September 1 feed declares a service window from August 31 through October 1, which covers the Fair dates. The repository snapshot fetched August 23 ends September 21, so the committed Fair-transit helper correctly reports only partial coverage until that generated dataset is refreshed and reviewed.

That does not make every transit claim safe. The current feed shows usable weekday times for the 15 Connector at that stop, while East Frederick Shuttle stop times are not populated there. Radius must calculate service for the selected date from the current calendar, exceptions, trip, and stop-time data, and then use GTFS-RT only when a current prediction exists. Weekend service, a Fair-specific detour, and the Fair's separate Lot D ADA shuttle must never be inferred from a route association.

- Static and realtime source: https://passio3.com/frederick/passioTransit/gtfs/google_transit.zip
- Official county schedules: https://www.frederickcountymd.gov/199/Connector-Schedules
- Official Fair visitor facts: https://thegreatfrederickfair.com/plan-your-visit/

The useful first transit card is therefore:

1. the selected arrival day and whether the current feed covers it;
2. the nearest published stop and a clearly labeled straight-line proximity, not a walking route;
3. only trips that actually serve the stop on that date;
4. a live prediction and vehicle only when the feed is available and fresh;
5. the last realistic return option;
6. official schedule and directions fallbacks when any part is unknown.

The Fair's own shuttle is a separate layer from county transit. The official FAQ says a free ADA-compliant shuttle runs frequently from Lot D to Gate 4A, but `frequently` is not a published headway or live ETA. Radius can repeat the fact and return point, not draw a countdown. The Fair directs rideshare and drop-off traffic to the Gate 4A pull-off and identifies accessible unloading at Gate 1, Gate 4A, or Building 15. Those remain static source-backed instructions unless the Fair supplies an authorized status channel.

## 2026 launch scope

### Required for public promotion

1. **Fair today**
   - Day-filtered official schedule.
   - Happening now, starting soon, and later today.
   - Filters for animals and agriculture, kids, free entertainment, grandstand, food, and accessibility-relevant activities.
   - Source and last-checked time on every operational claim.

2. **One Fair Plan**
   - Save schedule items, vendors, foods, facilities, and parking notes in one local plan.
   - Show time conflicts, ended items, and the next useful stop.
   - Reuse the current Radius event save, calendar, share, and directions behavior where it is already trustworthy.

3. **Grounds map plus equivalent list**
   - Gates, official buildings, stages, barns, food/vendors, restrooms, first aid, visitor centers, family rest area, mobility rental, ATMs, exits, and parking lots.
   - Foreground-only location, requested at the moment the user asks for nearby help.
   - Every map destination must also be reachable in an accessible list.
   - Do not claim an accessible route until it has an official source or field verification.

4. **Near me now**
   - Useful options beginning within 45 minutes and roughly a five-minute walk.
   - Interest, family, budget, food, and accessibility filters.
   - Walking time based on a verified fairgrounds path network, not straight-line distance.

5. **Food and vendor finding**
   - Search the item a person wants, not only a company name.
   - Clearly label vendor-supplied menus, prices, and allergen statements.
   - Never turn a vendor allergen statement into a Radius safety guarantee.

6. **Getting there and getting home**
   - Official lot prices, payment type, entrances, and directions.
   - Manual save-my-car location and a plain fallback note.
   - Departure guidance that avoids pretending Radius has live lot capacity unless an official feed exists.

7. **Offline Fair pack**
   - Versioned schedule, vendor/facility directory, lightweight grounds map, source timestamps, and saved plan.
   - Visible saved-for-offline confirmation.
   - Stale-data warning and a static fallback when an update fails.

8. **Source-tagged notices**
   - Cancellations, moves, closures, and safety messages only from an authorized source.
   - Publisher name, timestamp, and direct official link.
   - Radius repeats the notice and never presents itself as the emergency authority.

### Valuable after the core is dependable

- A Fair Crew share link with a shortlist, a next-stop vote, and a meeting place/time. Joining should not require an account.
- A controlled Fair Passport pilot using direct Radius destinations and a small set of approved QR locations.
- Qualitative, time-stamped crowd reports such as quiet, steady, or busy, with confidence and decay. Do not invent exact line times.
- Partner offers that are saved or verified without requiring contact information to participate.

### Explicitly deferred

- A new native app.
- Radius checkout, ticket custody, or mobile food ordering.
- Continuous friend or visitor location tracking.
- Chat.
- Exact ride or food-line wait times without an authoritative source.
- A large prize economy.
- An internet-exposed NAS admin panel.

## Data and trust contract

The current Radius Fair hub is editorial and the live Fair Google Calendar is useful, but neither is sufficient through the current generic event path. A September 1 source capture was about 2.46 MB with 2,201 historical and future events. The 2026 Fair is encoded in 10 VEVENT records for nine days: one standalone September 18 event, one September 19 through 26 daily recurrence master, and eight dated `RECURRENCE-ID` overrides. The opening event and overrides carry 190 schedule rows inside HTML-table descriptions. The current live parser ignores the recurrence metadata and clamps each description to 300 characters. Downstream recurrence collapsing then reduces the opening day and eight rich overrides to one September 18 card, while the location-less generic recurrence master can survive as a September 19 duplicate. A specialized, fixture-tested Fair adapter can recover the official schedule rows, but coverage must be measured against the published schedule before it becomes canonical.

Fair Mode needs a validated domain with stable identifiers for:

- `FairDay`
- `FairScheduleItem`
- `FairZone`
- `FairVendor`
- `FairFacility`
- `FairAccessFact`
- `FairLot`

Every record must carry a source URL, publisher, and checked time. Certainty is structural rather than a generic confidence score: fact fields use explicit `known` or `unknown` states, while schedule timing distinguishes exact, start-only, open-ended, approximate, and unknown values. Unknown is a valid and visible value. Missing accessibility, payment, route, or allergen information must never be guessed.

Reviewed schedule items may project into the existing Radius `Event` model only when that model preserves their sourced timing and status without inventing precision. Unspecified, approximate, and open-ended rows stay Fair-native until the shared model can represent them honestly. The Fair manifest remains canonical; compatible projections can support Today, Events, Map, Saved, calendar export, and event details without creating a second source of truth. Fair-specific optional identifiers may include a parent series, stage, zone, and booth.

### Source and permission ladder

1. **Public-facts release**
   - Use factual information from official public pages with direct attribution.
   - Link to official Etix and EventHub destinations.
   - Use Radius branding and an independent-guide disclosure.

2. **Structured-data partnership**
   - Request an official export for schedule, vendors, booth assignments, facilities, late changes, and accessibility.
   - Agree on update cadence, field ownership, emergency-source rules, and redistribution rights.

3. **Co-promoted experience**
   - Obtain written permission for Fair marks, official on-site QR placement, tickets/email promotion, and a late-change operator channel.
   - Keep Radius privacy, source, and uptime boundaries intact.

The first public release should not scrape or republish the EventHub dataset at scale without permission. A direct handoff to EventHub is the honest fallback until a supported export exists.

## NAS role

The NAS makes Fair Mode cheaper and more dependable, but it does not serve attendee traffic.

It should:

- fetch approved official sources on a bounded schedule;
- archive source snapshots with checksums;
- parse into the typed Fair manifest;
- compare the new snapshot with the last approved version;
- reject invalid dates, duplicate IDs, impossible locations, missing attribution, and oversized packs;
- produce a human-readable change report;
- build and test the versioned offline pack;
- run weak-network, accessibility, link, and load checks;
- keep encrypted backups and a restore drill;
- notify an operator when a schedule move or source failure needs review.

It should not:

- be the public origin;
- publish unreviewed source changes;
- expose DSM or a control panel through QuickConnect;
- hold a permanent broad GitHub credential;
- turn attendee location into an archive.

Vercel and its CDN remain the public runtime. The product must survive a NAS restart or home-internet outage.

## Peak-load and low-cost architecture

The Fair's roughly 230,000 visitors are an acquisition ceiling, not a forecast that every attendee will open Radius. The system should still be designed so a breakout does not require an emergency rewrite.

### Planning scenarios

| Scenario | Unique Fair users | Repeat opens | Design purpose |
|---|---:|---:|---|
| Controlled pilot | 5,000 | 20,000 | Prove the journey and source operations |
| Strong local adoption | 25,000 | 100,000 | Validate promotion and normal peak behavior |
| Breakout | 100,000 | 500,000 | Exercise cost and dynamic-feed boundaries |
| Audience ceiling | 230,000 | 1,150,000 | Bound static transfer and request exposure |

Design for 5,000 simultaneous active users and load-test a 10,000-user shock against a production-equivalent preview, including 10,000 QR arrivals over four minutes, about 42 new sessions per second. Test dynamic features separately at their own realistic concurrency. These are capacity targets, not claims that production has passed them yet.

For a 10-minute attendee session, budget approximately 12 cached HTML, asset, and Fair-pack requests; no automatic database read or paid-provider call; no realtime socket; and at most one optional idempotent write. A user-opened transit view may add 20 small polls over five minutes. At 10,000 simultaneous users with 20 percent opening transit, that is roughly 120,000 cached/static requests plus 40,000 transit requests, or 160,000 requests total, before any separately designed status refresh. The exact budget must be measured from the candidate build.

### Public data path

```text
Official schedule, map, facilities, parking
                    |
                    v
       NAS fetch, archive, validate, diff
                    |
              reviewed publish
                    |
                    v
       versioned Fair pack on Vercel CDN
                    |
        +-----------+------------+
        |                        |
        v                        v
 server-rendered first view   IndexedDB offline copy

GTFS-RT, NWS, and MDOT live feeds
                    |
          shared Vercel cache window
                    |
       only the open, relevant live card

Supabase
  optional crew links and bounded writes only
  never required for first view, schedule, map list, or device saves
```

The versioned pack should be an immutable JSON or GeoJSON asset with a checksum and a small mutable pointer to the current approved version. The browser keeps the last known good pack. Rollback changes the pointer; it does not require rebuilding every page.

### Budgets and request discipline

- Target a compressed Fair pack at or below 600 KB, enforce a 1.5 MB hard release ceiling excluding optional owned photos, and keep the complete cold first-use transfer near 1 MB.
- Keep the first useful answer to six or fewer public requests and the whole cached shell, asset, and pack path near 12. Repeat use should prefer the saved shell and Fair pack.
- At the audience ceiling, one 1 MB cold fetch per attendee is about 230 GB. That is materially below Vercel's currently published first 1 TB of included fast data transfer, but existing Radius use, retries, headers, maps, and images still count against headroom.
- Six first-load edge requests for all 230,000 attendees are about 1.38 million requests, below Vercel's currently published first 10 million edge requests. Automatic polling can erase that advantage.
- A general Fair-status check may refresh no faster than once per 60 seconds. An explicitly opened transit card may poll a tiny shared Radius snapshot every 15 seconds for no more than five minutes, only while both the card and browser tab are visible. One thousand continuously open 60-second status cards for ten hours would still create about 600,000 requests in a day.
- Clients call Radius for live transit and traffic snapshots rather than calling Passio, MDOT, or Google feeds directly. A five-second edge cache should collapse thousands of transit readers into no more than one upstream refresh per feed TTL and active region. Interactive Mapbox style and tile requests are the deliberate client-side exception, and they begin only after the visitor opens the map.
- Never run place photos, search-provider fallbacks, directions, isochrones, Ask, or route generation automatically per visitor.
- Do not initialize Mapbox on the first view. A list and static grounds representation answer the first task. The interactive map loads only after a map action. With the currently published 50,000 free monthly web map loads, opening a map for every possible Fair attendee would create avoidable cost.
- Do not automatically download the current roughly 29.5 MB county PMTiles archive. Ten thousand downloads would move about 295 GB before the Fair schedule, app shell, images, or repeat traffic.
- Route planning inside the Fair should use a small field-verified graph built ahead of time, not a paid directions call for every path.
- Device saves and the Fair Plan stay local. Supabase is reserved for an optional bounded Crew share, approved operator input, and a small telemetry write path.
- Replace per-navigation Radius decision telemetry on `/fair` with one bounded outcome batch. Optional research events can use deterministic sampling and never carry precise location.
- Keep live data responses tiny, source-timestamped, and shared at the edge. Stop predictions and MARC data must use shared snapshots before they are exposed to Fair-scale polling.
- At 45 seconds, mark a transit snapshot stale. At two minutes, remove moving markers and return to static schedules. An empty or failed feed never means `no service`.

The normal Radius shell currently performs work that should not be automatic in Fair Mode. It posts a tracking request on navigation even when anonymous page views are discarded, the full map can begin transit polling before the visitor selects Transit, the food-truck surface is dynamic and polls, and place photos, travel matrices, isochrones, Ask, and provider fallbacks can create paid or origin work. Fair Mode needs a lightweight route contract that suppresses those startup paths. Its schedule, vendors, facilities, and food index should search locally inside the pack rather than call the server on each keystroke.

### Degraded-mode contract

| Failure | Visitor experience | Operator action |
|---|---|---|
| NAS or home internet down | Current CDN pack and normal public app continue | Restore builder later; no public failover to DSM |
| Official schedule source down | Last approved schedule remains with a stale notice and official link | Investigate source; do not replace it with scraped guesses |
| Invalid source change | Last approved pack remains | Review the diff, correct parser or source input, then republish |
| GTFS-RT unavailable or stale | Static stop and schedule facts remain; live ETA disappears | Check provider health; never convert missing feed to `no service` |
| Mapbox unavailable or budget-limited | Equivalent list, gate steps, and saved return instructions remain | Keep interactive map disabled until healthy |
| Supabase unavailable | Device saves continue; Crew sharing and remote writes pause | Restore the optional service without blocking the guide |
| Telemetry unavailable | User journey continues silently | Backfill nothing from location or browsing history |
| Bad public pack | Browser and CDN retain last known good version | Move the current-version pointer back and verify the journey |

### Cost tripwires

Before promotion, set alerts at 60, 80, and 95 percent of the monthly Vercel transfer, request, and function budgets; the Mapbox map-load allowance; and Supabase cached and uncached egress. The operator should be able to disable optional map, photo, Crew, and telemetry features independently without removing the schedule, access facts, parking, or offline plan.

The first response to a spike is to remove optional dynamic work, lengthen refresh windows, and keep the static field program alive. It is not to route attendees to the NAS.

Supabase must not be on the static-guide path. If Crew sharing or a later action is enabled, the browser sends one idempotent request through Radius to one bounded database transaction. Use a signed session and action key rather than a small per-IP allowance because many legitimate visitors can share the same Fair Wi-Fi address. Verify the production connection uses the serverless transaction pool before launch. Attendee-wide Supabase Realtime is explicitly out of scope.

## NAS Fair operations

The NAS should turn public-source maintenance into a predictable publishing lane:

1. Check schedule and notice sources every 30 minutes before Fair week and every five minutes during published operating hours. Add jitter and respect upstream limits.
2. Store the raw response, source headers, retrieval time, and SHA-256 checksum in an append-only dated archive.
3. Parse into the strict Fair domain and compare row counts, IDs, dates, times, locations, attribution, and pack size with the current approved version.
4. Produce a plain change report. No-change runs stop. Invalid runs alert and retain last known good. Material changes wait for an authorized review.
5. Build the immutable pack, run unit, accessibility, weak-network, offline, link, and size checks, and open the bounded publish change.
6. After approval, verify the production pack hash, first-use journey, and offline fallback from outside the home network.
7. Run an uptime check against `/fair`, the current pack pointer, pack hash, and live-source age every two minutes during the event. Alert on repeated failure rather than on one transient miss.
8. Keep encrypted backups, a documented restore, and a pre-Fair restore drill. Expire routine raw snapshots and logs under a written retention policy.

The GitHub runner should remain outbound-only, labeled for the approved Fair and data workflows, and constrained to the control plane's resource limits. It must not accept arbitrary pull-request code from untrusted forks, expose the Docker socket broadly, reuse a permanent registration secret, or share attendee data with build jobs.

Current September 1 boundary: the GitHub audit found zero active self-hosted runners, and DSM has no verified running Radius runner project. This is the target operating lane, not a claim that NAS automation is already live. Registration comes only after the control-plane change is merged, using a short-lived one-hour token that is cleared from DSM immediately after registration.

## Acquisition and retention loop

```text
Fair sign, vendor QR, search result, or shared plan
                         |
                         v
                  Radius Fair Mode
                         |
                         v
          Find the next thing and get there
                         |
                         v
       Save a vendor, performer, place, or plan
                         |
                         v
              Return during Fair week
                         |
                         v
       Continue using Radius around Frederick
```

On-site promotion should lead to an exact task, not a generic home page. Examples include `Find food near this barn`, `What starts next?`, `Save where you parked`, and `Meet here at 4:30`.

After the Fair, saved local businesses, performers, and places should remain in the normal Radius experience. That year-round continuity is the durable advantage.

## Opportunity portfolio beyond the guide

The first release should stay focused, but the Fair can prove several reusable Radius products.

1. **Fair Now field program**
   - Turns a dense official schedule into the next best decision for a time budget, interest, weather, family, or access need.
   - Pilot one day and three real scenarios. Continue only if people complete the task at least 20 percent faster than with the current schedule.

2. **FairFlow arrival and departure**
   - Combines the verified parking, payment, gate, drop-off, accessible shuttle, county transit, MARC, and traffic facts that currently live in separate places.
   - Pilot one evening. Continue only if it changes a useful arrival or departure decision without creating confusion.

3. **Access First companion**
   - Verifies the full journey for wheelchair users, seniors, caregivers, families, and visitors who need quieter or lower-friction options.
   - Pilot ten high-value waypoints and three complete journeys with accessibility users or advocates. Do not publish inferred routes.

4. **Scan-and-Save vendor passport**
   - An approved booth QR saves a vendor and connects the visitor to that business, farm, or market after the Fair.
   - Pilot 10 to 15 vendors. Continue only if scans become meaningful saves and people return after the event.

5. **Fair to Frederick handoff**
   - Offers a small number of current, capacity-aware Frederick options after departure, based on time, party type, opening hours, and travel direction.
   - Start editorially with ten places and no required discount.

6. **Agriculture-to-Frederick graph**
   - Connects an exhibit or demonstration to an approved local farm, creamery, apiary, market, or educational resource that remains useful year-round.
   - Do not profile minors or turn youth exhibits into commercial endorsements.

7. **Live Fair Canvas**
   - An approved scan-once, anonymous audience choice becomes a collective visual or nightly reveal on an event screen.
   - This is a later spectacle layer, not a requirement for the attendee guide. It needs Fair, screen, sponsor, and controlled-game approval.

8. **Operator fieldbook**
   - A private supplemental board for non-emergency corrections, facility issues, vendor help, and approved public notices.
   - It must never replace radio, 911, incident command, or Fair safety procedures.

9. **Sponsor-funded utility**
   - A sponsor underwrites something useful such as accessible routes, water and restroom finding, weather help, or departure guidance.
   - Sponsor credit stays restrained and never changes safety, accessibility, or recommendation ranking.

10. **Fair Signal Studio**
    - Privacy-minimal reporting answers named operating and product questions using searches, saves, route intent, source opens, and post-Fair return.
    - Do not build a vanity dashboard or require precise location to make the report valuable.

The strongest expansion order is Fair Now, Access First, and the vendor passport, with FairFlow embedded in the first Fair Now release. Together they provide immediate attendee value, a credible partnership wedge, a proprietary local business graph, and a reason to keep using Radius after nine days.

On-site QR placement, Fair marks, EventHub reuse, live lot or crowd status, vendor participation, sponsor treatment, screens, games, operator tooling, and official public-safety messages all require Fair permission. Public facts, attributed links, and an independently branded prototype can move first.

## Privacy-safe measurement

The current guide opens anonymously, but technical inspection found Map Dynamics tracking, cookies, and local storage, while the linked privacy policies do not explain the Fair-specific retention and use in plain language. Radius can make privacy clarity part of the product advantage.

Measure product decisions rather than continuous movement:

- QR open rate by approved campaign code;
- search success and zero-result terms;
- schedule, vendor, food, and facility saves;
- completed route requests;
- filter use, especially food and accessibility;
- shared-plan opens and votes;
- same-day and Fair-week return;
- seven-day and 30-day return to regular Radius;
- discovery beyond the already-famous vendors;
- offer saves or verified redemptions in a partner pilot.

Do not store continuous location history by default. Group planning and passport participation should work anonymously. Any adult email or SMS opt-in must be separate, optional, unchecked, and plainly described.

## Two-week launch plan

### September 1 to 3: establish truth

- Complete the typed Fair manifest and validation tests.
- Measure the official iCal feed against the full published schedule, including recurring items.
- Request the current structured schedule, EventHub/vendor export, grounds map, accessibility information, parking details, and redistribution permission.
- Confirm the official channel for late changes and emergency notices.
- Freeze the first public feature list.

### September 4 to 8: build the core journey

- Expand the existing Fair moment with Fair today, day filtering, source times, official ticket handoff, and saved event actions.
- Add verified facilities, parking, access facts, and a list-first grounds model.
- Add the short `/fair` redirect.
- Add Fair analytics events with low-cardinality values.
- Produce the first static offline pack.

### September 9 to 12: make it work on the grounds

- Add the map, path network, nearby-next suggestions, food/vendor search, and manual car locator only where source rights and coordinates are settled.
- Walk the grounds with the current map and validate gates, paths, buildings, services, and accessibility claims.
- Test phone sizes, screen reader, keyboard, large text, reduced motion, bright-light contrast, airplane mode, weak cellular service, and a four-hour battery session.

### September 13 to 15: prove operations

- Load-test at twice the expected peak.
- Inject failures for the Fair source, Mapbox, Supabase, push, and NAS.
- Prove the static schedule/map fallback.
- Rehearse a cancellation, relocation, source outage, and bad-data rollback.
- Verify production at the expected commit and run the attendee journey on real phones.

### September 16 to 17: controlled promotion

- Start with owned Radius channels and a small approved QR pilot.
- Watch zero-result searches, broken routes, stale-source age, and offline-pack uptake.
- Expand promotion only after the live journey and operator response are proven.

## Go or no-go gates

Fair Mode is ready for broad promotion only when:

- the public schedule coverage has been measured against the official full schedule;
- every displayed operational fact has a source and checked time;
- cancellations and relocations have a tested propagation path;
- the map and equivalent list agree;
- accessibility claims are sourced or field-verified;
- offline mode works from a cold start after the pack is saved;
- the public experience works if the NAS is down;
- the peak-load test passes;
- the static fallback is available;
- the product is visually and verbally Radius, with no unapproved Fair marks;
- production has been verified at the expected commit.

The peak-load gate means:

- 5,000 expected and 10,000 shock concurrency, ramped over four minutes and held for ten;
- warm-CDN, cold-live-snapshot, new-pack-pointer, and rollback cases;
- at least 1,000 simulated clients sharing one source address;
- GTFS, Supabase, KV, Mapbox, and NAS failure injection with paid providers mocked and no production writes;
- at least a 99 percent CDN hit ratio after warm-up;
- static p95 time to first byte below 250 milliseconds, p99 below one second, and errors below 0.1 percent;
- automatic origin work at or below 0.2 function invocation per session, with zero default paid-provider calls;
- no more than one upstream live-feed fetch per TTL and active region, plus 20 percent tolerance;
- at least a 90 percent reduction in provider and origin traffic within 60 seconds of degraded mode;
- the Fair pack at or below the 1.5 MB compressed hard ceiling and usable offline;
- stale live data always labeled, no false shared-Wi-Fi block, and both content-pointer and deployment rollback rehearsed.

If the structured map or vendor rights are not settled in time, ship the trustworthy schedule, plan, parking, services, and direct EventHub handoff. Do not fill the gap with guessed booth coordinates or copied data.

## Immediate implementation decision

The first repository slice is the typed Fair manifest, its validation contract, a Fair-only source adapter that recovers the nine official 2026 day tables and all 190 schedule rows without inventing missing times, and a static transit-evidence helper that keeps a published stop-to-route association separate from a service or arrival claim. It creates a safe place for schedule, map, vendor, parking, accessibility, and transit facts without claiming those datasets are complete.

The next slice is a dedicated Fair workspace rendered at the canonical moment and short `/fair` route. It should implement the pre-arrival state, Time Ribbon, source-stamped Fair Now rows, device-local plan shell, and transit or parking choice before map or group features. Reviewed schedule rows can then promote into the existing event model only where the generic model can preserve their time certainty. The 51 rows with no source time and every approximate or open-ended row remain Fair-native until the shared model represents them honestly.
