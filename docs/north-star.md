# Frederick Radius — North Star

The reference for *why* this project exists and what every feature is in
service of. Read this before proposing or building anything. When a
decision is ambiguous, the principle that wins is the one that deepens
**one-county unification by proximity**.

---

## 1. What it is

Frederick Radius is the single digital hub for Frederick County,
Maryland — 305K+ residents across 12 municipalities. One proximity-based
experience that consolidates what is otherwise fragmented across 6+
disconnected sources (Visit Frederick, DFP, Eventbrite, the county and
city government sites, Facebook, Nextdoor).

It serves four personas, always: **Residents, Visitors, Business Owners,
Civic Partners.** A feature that does not clearly serve at least one of
them is not yet a feature.

## 2. Why it wins (the wedge)

National tools structurally will not do civic-local unification for one
county:

- Google Maps optimizes globally, not civic-locally.
- Facebook / Reddit / Nextdoor are social feeds, not structured
  civic + commercial + event data.
- Government sites are single-purpose silos.
- Visit Frederick is visitor-only.

The defensible product is the **live civic layer + dual resident/visitor
mode + one radius spanning all 12 municipalities.** The operating rule
that follows from this:

> **Bring data IN. Never bounce the user OUT.**
> Every time we would link a user to a gov/external site to *get* an
> answer, the better move is to ingest that data and answer in-app.

## 3. The differentiator: the connectivity layer

Rich entities existed but were keyed independently — places by slug,
events by municipality, civic anchors by hand, the live pulse county-
wide-but-unanchored. Nothing tied the user's *actual position* to one
county-wide, multi-entity picture, so "what's happening around me right
now, anywhere in the county" was not expressible.

`src/lib/connect.ts` is that fusion and is the spine of the product:

```
point ──resolveMunicipality──▶ municipality
municipality ──civicAnchorsFor──▶ civic context
point ──nearbyNow──▶ { municipality, civic, open places, live/soon
                       events }  by true distance, COUNTY-WIDE
```

Non-negotiable properties of this layer:

- **Pure and isomorphic.** No network, no key, no hidden clock. Runs
  identically on the server and the client; unit-tested. The clock is
  always injected so the join is deterministic.
- **County-wide by position, never town-gated.** A user in Brunswick
  sees the Thurmont thing that is genuinely closer to them.
- **Honest.** It composes only canonical loaders (which already drop
  closed places and known-closed venues). It never invents data.

`NearbyNow` (on `/today`) is the visible payoff: opt-in, on-device
location resolution (no reverse-geocode key), one tap to clear, civic
links stay in-app. New location-aware surfaces should consume
`nearbyNow()` rather than re-deriving proximity.

## 4. The social-data answer (Facebook / Instagram)

The recurring, legitimate question: *so much real-time local activity
only lives on Instagram and Facebook — if we can't escape them, how do
we get that data?*

The honest answer, and the strategy:

1. **We do not scrape Meta.** Instagram/Facebook only expose data via
   the Graph API to owner-authorized accounts. There is no legitimate
   API for arbitrary local businesses. Scraping violates their ToS, is
   brittle, and is hostile to the businesses we want as partners. This
   is a permanent constraint, not a TODO.

2. **Structured public sources first.** Most of what looks "social-only"
   has a structured origin: farmers markets (USDA / MDA directories),
   ticketed and free events (Eventbrite), live music (Bandsintown,
   Songkick), library and parks programs, county meeting agendas
   (Legistar/Granicus). These are in `data/sources.yaml` as the
   `discover-sources` batch, gated at `pending_approval`.

3. **Partner aggregators second.** Visit Frederick and the Downtown
   Frederick Partnership already aggregate much of the event activity.
   Several feeds (Eventbrite/Songkick) are partner-gated — that is a
   relationship to pursue, not a wall.

4. **The owner-submission flow is the moat.** The durable answer to
   "it's only on their Instagram" is to let *verified local owners post
   specials, pop-ups, and tonight-only events directly* (`business_
   specials`, an internal submission source, `pending_review` until the
   moderation queue ships). This produces structured, real-time, first-
   party data that nobody else has — including Meta. It is the single
   highest-leverage data asset on the roadmap.

The connectivity layer is already built to receive all of this:
`nearbyNow().feeds` is a typed seam (`farmersMarkets`, `specials`) that
stays empty until a human activates the source. **Built, not faked** —
the day a source goes active, it slots into the same county-wide,
location-aware join with zero UI or test churn.

## 5. Data posture (how sources move)

`data/sources.yaml` is the **true inventory**. Discipline:

- Nothing is fetched until a human flips a row to `active`/`scaffold`.
  `pipeline/fetch_all.ts` only pulls those.
- Agents *propose* (`audit-sources`, `discover-sources`,
  `diagnose-failure`); humans *approve*. See `AGENTS.md`.
- Gates are real. Licensing review, a privacy review for sensitive data
  (lead service lines, PulsePoint), a moderation policy for owner
  submissions — these block activation and are stated in the row's
  `notes`. Do not route around a gate to ship faster.

## 6. Identity

The **System Black** palette (base `#0A0A0A`, warm white `#F0ECE6`,
muted civic blue, muted park green) is a validated direction — premium,
restrained, confirmed by the founder. Extend it; do not reintroduce new
colors. The remaining UI lever is **density and visual hierarchy**, not
color. References: Google's utility, Apple's storytelling, Tesla's
engineering.

## 7. Roadmap framing

Every workstream is framed as deepening the one-stop unification:

- **Shipped:** P0 data-quality + Mapbox migration + restyle +
  coordinate spine + wellness slice; the discover-sources batch
  (`#15`); the connectivity layer + county-wide location-aware Live Now
  (`#16`).
- **Next:** activate gated sources behind their reviews (farmers
  markets, partner event feeds); the owner-submission queue (the moat);
  the civic MVP.
- **Always deferred to a human:** contested product calls (e.g. the
  Phase-3 homepage, the `/` home route), anything that expands an
  audience or accepts terms, and any source activation.

## 8. Operating principles (the short list)

1. Bring data in; never bounce the user out.
2. County-wide by proximity; never silo to one town.
3. Honest UI: never show a place as open we cannot stand behind; never
   fake a gated feed — use the `connect.ts` seam.
4. Never scrape Meta. Structured sources + partners + owner submissions.
5. The manifest is the inventory; agents propose, humans activate.
6. Verify before shipping (tsc, eslint, unit tests, `next build`,
   mobile browser at ~375px). Each workstream isolated on its own
   branch + PR. Push to `main` auto-deploys prod — so gate contested
   and licensing-blocked work; ship the verified rest.
7. Extend System Black; the lever is density, not color.
