# Fair Day growth and digital product strategy

Reviewed September 1, 2026.

## Decision

Build **Fair Day by Frederick Radius** as a fast web product at the existing canonical URL:

`https://frederickradius.app/moments/great-frederick-fair-2026`

Keep `https://frederickradius.app/fair` as the short, year-independent doorway. Purchase two redirect domains only after checkout confirms that they are still available:

1. `frederickradius.com` to protect the durable brand and catch people who assume the product uses `.com`.
2. `fairdayfrederick.com` for signs, radio, social posts, and QR codes during the Fair campaign.

Both names returned no domain record from the Verisign `.com` RDAP service during the September 1 review. That is a point-in-time indication, not a reservation. `frederickfairguide.com` is already registered and operating.

Do not create a second copy of the site on either domain. Redirect both names to the canonical Frederick Radius pages so search authority, analytics, saved plans, and future Fair years stay in one product.

## What the market already proves

| Product | Useful patterns already in market | What it leaves open for Radius |
| --- | --- | --- |
| [Minnesota State Fair app](https://www.mnstatefair.org/web/app/) | Searchable food, shops, and schedule; favorites; filtered map; current location; offline access to most core data | Strong event utility, but not a guide to the surrounding destination |
| [Illinois State Fair app](https://statefair.illinois.gov/info/mobile-app.html) | Schedule alerts, food finder tied to the map, coupons, photo booth, interactive map, scavenger hunt | Feature-rich, but the experience is contained inside the Fair |
| [New York State Fair Finder](https://nysfair.ny.gov/fair-finder/) | Layered interactive map plus parking, transportation, accessibility, tickets, and alerts | Broad operational coverage, but it requires the Fair to maintain many official feeds |
| [Stanislaus County Fair app](https://www.stancofair.com/p/2026-fair/fair-info/fair-app) | Tickets, schedule, map, food, favorites, alerts, kids scavenger hunt, photo filters | Proven parity list, but little reason to keep the product after the event |
| [Adams County Fair app](https://www.adamscofair.com/app/) | Saved events, directions, sharing, memories, and limited-connectivity support | A polished event companion, but still a download for one event |
| [Great Frederick Fair EventHub map](https://mobile.eventhub-floorplan.net/?Show_ID=18209) | 2026 floorplan, exhibitors, schedule, and sponsors | Useful official vendor directory; weak at arrival, personal planning, offline confidence, local continuation, and one-tap essential services |
| [Frederick Fair Guide](https://frederickfairguide.com/) | Search-oriented static pages for tickets, schedule, food, parking, and lineup | No interactive day planner, offline pack, personal route, saved car, accessibility route, transit reasoning, or natural bridge into the rest of Frederick Radius |

The market says the baseline is clear: schedule, food, map, favorites, alerts, and offline access. Copying that list will not be enough. Frederick Radius should reach parity on the important tasks while owning the transition between the Fair and the rest of Frederick.

## The product gap to own

The useful promise is not “all Fair information.” It is:

> Tell me what my group should do, what it will cost, how to get there, where to find it, and what to do next in Frederick.

### Before the visit: Ready to Go

Ask only for inputs that materially change the answer:

- Fair date
- number of adults, children, seniors, and military guests
- arrival method
- available time
- ride interest
- grandstand plans
- mobility, sensory, or family needs
- rough budget

Return a numbered plan with reviewed prices, the correct deal for that date, official purchase links, parking payment requirements, likely arrival gate, selected program stops, and a return plan. Never present an estimate as an official price or a transit association as confirmed Fair service.

### Ticket buying: Radius decides, Etix sells

Radius can make the ticket journey much better without becoming a payment processor:

1. Ask for the Fair day and group facts that change eligibility.
2. Show only offers valid for that date and before any known deadline.
3. Explain the price, quantity, inclusions, parking status, and important exclusions in plain language.
4. Compare only like-for-like options. Never call admission-only cheaper than a bundle that includes rides or parking.
5. Send the visitor to the exact official Etix product page with the existing partner parameter intact.
6. On return, keep the chosen option inside Ready to Go and help the visitor prepare the purchased ticket for weak service.

Etix now documents an [Etix Wallet](https://support.etix.com/general-info/what-is-etix-wallet-and-how-do-i-use-it) that can collect eligible tickets and add them to Apple Wallet or Google Wallet for access without cellular service. Radius should link to that official process rather than store barcodes, screenshots, order numbers, payment details, or copies of tickets.

A deeper integration is possible only with authorization. [Etix describes API access](https://hello.etix.com/clients/integrations-partnerships) to event information, seat inventory, order information, memberships, and sales data, plus co-branded purchase pages and channel partner IDs. Its [API Partner Terms](https://www.etix.com/ticket/online3/apiPartnerTerms.jsp) require an executed partner agreement, limit caching, and prohibit an API client from replacing Etix's essential purchase experience. The Great Frederick Fair, as the Etix client and owner of the patron relationship, would need to approve the data use and ask Etix to provision Radius.

With a formal partnership, request:

- a Radius-specific partner ID so the Fair can measure attributed sales
- a Fair-branded co-brand for a visually continuous checkout
- read-only event, offer, availability, and purchase-deadline data
- an approved return URL into the saved Fair Day plan
- documented ticket-wallet and order-recovery links
- aggregate conversion reporting, not unrestricted patron data

Keep card entry, fraud checks, fulfillment, ticket delivery, refunds, and barcode validation inside Etix. Do not scrape protected Etix pages or infer inventory from a page response.

The currently reviewed official Fair visitor page links to the Etix products with `partner_id=944`. A separate live link supplied during review used `partner_id=947` plus a long `_gl` value. Etix documents partner IDs as channel-attribution tools. The `_gl` value is a temporary Google cross-domain measurement token and must not be stored in the Fair data pack. Until Radius receives its own approved partner ID, use the stable link published by the official Fair page and keep `partner_id=944` intact.

### During the visit: Fair Now

The first screen should answer immediate questions rather than behaving like a brochure:

- What is happening next?
- Where is the nearest restroom, first aid, quiet option, gate, food stop, or saved event?
- Where did I park?
- What is my next numbered stop?
- Did an official source change the schedule?
- What still works when the grounds have weak service?

The main schedule, map, plan, and essential-service locations should be cached before arrival. Official pages that require connectivity remain clearly labeled external links.

### Leaving: Get Me Home

The exit experience is an unusually valuable gap:

- show the saved lot or arrival point
- surface the correct exit and return-transit information
- let a group share a simple meet point
- offer a one-tap route back to the saved car
- show an honest “service not confirmed” state when a live shuttle feed does not exist

### After the Fair: Keep Frederick Going

This is the strategic advantage over a single-event app. After the user has completed the Fair task, offer one restrained continuation block based on time and intent:

- “Eat nearby after the Fair”
- “Find coffee before the gates open”
- “Spend tomorrow in Frederick”
- “Stay overnight”
- “See what is happening this weekend”
- “Save the places you want to remember”

The result should open existing Radius place, parking, map, event, hotel, and municipality surfaces. It should not become an ad wall or a generic list of sponsors.

## The digital map

Use four layers rather than one overloaded map:

1. **Arrive**: official lots, entrances, accessible arrival, drop-off, transit stops, and saved parking.
2. **Find**: buildings, stages, food, vendors, restrooms, first aid, water, seating, quiet areas, and guest services.
3. **My day**: numbered stops from the selected plan, with the day and time visible.
4. **Official updates**: only changes with a source and timestamp. Community observations, if added later, must be visibly separate and expire quickly.

The owned aerial photograph is a premium orientation and storytelling asset, not a navigational base map. Use it for the Fair Day opening, a full panorama, and carefully selected editorial crops. Build the actual map from permissioned geometry or field-verified points. Do not infer safe pedestrian routes, accessible paths, gates, or current vendor positions from the 2024 photograph.

## Low-friction acquisition funnel

1. A search result, QR code, short domain, or social link opens the web experience with no app-store requirement.
2. The visitor gets a useful answer before any account prompt.
3. The plan saves locally and remains available offline.
4. Sharing sends a compact URL that opens the same day and stops for the recipient.
5. After the Fair task, one contextual action opens the broader Radius product.
6. After September 26, `/fair` changes to a recap and the next useful Frederick weekend rather than becoming a dead seasonal page.

Use source codes on campaign URLs for aggregate attribution, such as `?src=gate-poster` or `?src=fairday-domain`. Do not add third-party tracking pixels or require personal information to plan a visit.

## Domain and redirect setup

### Recommended names

| Domain | Role | Recommendation |
| --- | --- | --- |
| `frederickradius.com` | Brand protection | Buy first. Redirect it to `frederickradius.app` and keep `.app` canonical. |
| `fairdayfrederick.com` | Campaign doorway | Buy second. It matches the public product name without pretending to be the official Fair. |
| `frederickfairday.com` | Alternate campaign wording | Available in the point-in-time RDAP check, but less aligned with “Fair Day by Frederick Radius.” Skip unless the preferred campaign name is lost. |
| `aroundfrederick.com` | Broad visitor concept | Available in the point-in-time check, but it creates another brand and weakens Radius. Skip. |
| `frederickfairguide.com` | Existing independent competitor | Registered and already active. Do not pursue or imitate its identity. |

Avoid domains that present the product as “the official Great Frederick Fair app” or closely copy the organizer’s name. Every public Fair Day surface should say that Frederick Radius is an independent local guide and link ticket purchases and final rules to the official Fair.

[Cloudflare Registrar](https://domains.cloudflare.com/) says it charges registry cost without markup and includes DNSSEC, WHOIS redaction, DNS, CDN, and SSL. That makes two redirect-only `.com` domains a low-cost acquisition and brand-protection layer. Confirm the current registration and renewal prices at checkout.

Implementation:

- keep the application on Vercel and the canonical host on `frederickradius.app`
- manage the redirect domains in Cloudflare
- send every campaign hostname to `https://frederickradius.app/fair`
- preserve the query string so source codes survive the redirect
- use a temporary redirect while campaign destinations are being tested, then make it permanent once stable
- enable registrar lock, DNSSEC, and account two-factor authentication
- do not host a duplicate Fair site on the NAS or either redirect domain

## What the NAS should do

The NAS is the private production room, not the public origin:

- run the private GitHub Actions runner after the reviewed control plane is activated
- fetch and validate official Fair source changes on a schedule
- build the small immutable offline data pack and responsive photo derivatives
- run link, schema, accessibility, and mobile smoke checks
- archive each published pack, source snapshot, build log, and photo master
- generate a diff for human review when prices, dates, gates, or schedules change
- publish only reviewed static artifacts through GitHub and Vercel

Thousands of visitors should download the same small, cacheable files from Vercel’s CDN. They should not create thousands of requests to the NAS. Personal plans should remain local-first unless a later group-sharing feature needs a small, rate-limited server record.

## Release order

### Required for launch

1. Canonical Fair Day route and short `/fair` doorway
2. Official ticket choices and date-aware deal logic
3. Numbered day planner with a cost summary
4. Arrival, parking, payment, and source-age truth
5. Searchable schedule and essential-place finder
6. Offline pack and saved plan
7. Owned photograph with clear prior-visit attribution
8. Mobile, sunlight, accessibility, and weak-service testing
9. Fair-to-Frederick continuation block

### Add after the map is field-verified

1. Saved car and one-tap return route
2. Group meet point and shareable plan
3. Food and vendor filters with reviewed payment and accessibility details
4. Child-friendly agricultural scavenger hunt
5. Multilingual essentials
6. Optional official or short-lived community condition reports

Do not delay the useful core for a 3D digital twin, augmented reality, AI avatar, or unverified crowd heat map. Those features can look impressive while making the basic visit less reliable.

## Success measures

Use aggregate, first-party measures:

- percentage of visitors who complete a Ready to Go step
- plans created and reopened during the selected Fair day
- official ticket-link exits
- Find It searches that end in a mapped result
- offline pack success rate
- Fair visitors who open one broader Radius destination
- saves of non-Fair places within seven days
- return visits to Radius after the Fair closes

The important conversion is not an app install. It is a visitor getting through the Fair with less friction and choosing Frederick Radius again when the Fair is over.
