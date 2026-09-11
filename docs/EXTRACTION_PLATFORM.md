# The Extraction Platform — un-burying Frederick's data

> The pathway that makes it all come together. One engine pulls the
> buried local things — civic info, venue lineups, happy hours, what a
> place is known for — from wherever they hide, on a schedule, with
> source + freshness, and feeds them into the answer engine.

## The shape (one engine, many profiles)

```
config/<source>-sources.json     ← WHERE: which pages/venues to read + cadence
        │
        ▼
scripts/lib/extract-agent.ts     ← THE ENGINE: fetchPageText() → extractJson() (Claude)
        │                           (shared; never fabricates; caps tokens)
        ▼
scripts/ingest-<profile>.ts      ← WHAT: the shape to extract (civic | venue events | …)
        │
        ▼
src/data/<profile>.json          ← sourced, deduped, timestamped
        │
        ▼
loaders + the "ask Frederick" answer engine + the surfaces
```

Adding a new buried-data type = **a config + an extraction shape**, not a
new system. The engine, dedupe, scheduling, and provenance are shared.

## Collection methods — cleanest rung first

Not every source hides the same way, so the engine offers four collectors.
A venue/source declares its `method`; the agent picks the cheapest one
that works and falls back as needed. Prefer a structured feed over the
model whenever one exists — it is exact, free, and survives redesigns.

| Method       | When                                                   | How                                                                                                                                         | Model?       |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **`feed`**   | Squarespace events page (very common for small venues) | `fetchSquarespaceEvents(url)` reads `<url>?format=json` and `parseSquarespaceEvents()` maps `upcoming[]` (ms-epoch dates) deterministically | **No**       |
| **`render`** | JS-rendered or 403s a bare fetch                       | headless Chromium → text → `extractJson()`                                                                                                  | Yes (text)   |
| **`fetch`**  | static HTML                                            | plain fetch → text → `extractJson()`                                                                                                        | Yes (text)   |
| **`image`**  | calendar published only as a graphic (e.g. a Wix PNG)  | `extractJsonFromImage(url)` reads the image with Claude vision                                                                              | Yes (vision) |

`parseSquarespaceEvents` is pure and unit-tested (`tests/squarespace-events.spec.ts`)
against the real Banyan shape — no network, no key. The `feed` path needs
neither the API key nor Chromium; `image` needs the key but not Chromium.

## Live profiles

| Profile                | Source kind                                                                         | Output                 | Agent                       |
| ---------------------- | ----------------------------------------------------------------------------------- | ---------------------- | --------------------------- |
| **Municipal civic**    | town gov pages                                                                      | `municipal-civic.json` | `ingest-municipal-civic.ts` |
| **Venue events**       | venue sites (Banyan, Derby, Sky Stage…)                                             | `venue-events.json`    | `ingest-venue-events.ts`    |
| **Business deep-info** | each place's OWN website (571 food/drink, URLs already in `places-enrichment.json`) | `business-info.json`   | `ingest-business-info.ts`   |

The **business deep-info** profile is the moat at scale: it reads the
website each place already has on file and extracts what Google's listing
misses — known-for, happy hours, recurring specials, published hours,
reservations. Adaptive fetch (plain → render fallback), incremental +
batched (60/day, 30-day refresh), own-domain food/drink only. Most
Frederick small-business sites are directly readable; the CAPTCHA-walled
few (e.g. bentztown.com) are handled via aggregators instead.

## Next profiles (same engine — just add the shape + sources)

- **Happy hours / specials** — extract day/time/deal from a place's site
  ("Mon–Fri 4–6, $5 drafts"). Attaches to the place; answers "happy hour
  near me right now."
- **Known for / signature** — the 1–3 things a place is famous for
  (there's already a seed in `known-for.json` to merge + grow).
- **School closings/delays** (FCPS), **road closures**, **library story
  times**, **farmers-market vendors**, **movie showtimes**, **parking
  deck availability** — all web-sourced, all the same pattern.

## The social-media reality (food trucks, happy hours posted only on IG/FB)

Blind scraping of Instagram/Facebook is brittle + against ToS. Don't
build on it. Three honest paths, best first:

1. **Partnership / shared sheet** — the org gives us the data (free promo
   for them). Cleanest + reliable.
2. **Permitted API + Claude vision** — read the posted graphic _if_ we
   have page access. Elegant, gated on access.
3. **30-second human-in-the-loop** — paste the post/image weekly; Claude
   extracts; publishes. Reliable fallback.

The full candidate-only design, official platform boundaries, food-truck
freshness rules, and owner-beacon priority are documented in
`docs/SOCIAL_AND_EPHEMERAL_LEADS.md`.

## External retrieval providers

Firecrawl and Apify are retrieval mechanisms, not source authorities. Keep
them out of visitor request paths and use at most one external provider for a
source attempt after the structured, native-fetch, and local-render paths are
insufficient. The original venue, organizer, business, or government URL stays
attached to every candidate.

The original Apify venue pilot is retained as a historical, manually runnable
evaluation script, but its GitHub workflow is retired. The current Apify source
change radar checks three exact reviewed pages on a conservative monthly
schedule. It accepts no arbitrary URL, stores no downloaded page, cannot
publish, and has hard page, result, time, monthly-attempt, and dollar ceilings.
See `docs/APIFY_SOURCE_CHANGE_RADAR.md` and `docs/APIFY_VENUE_PILOT.md`.

## Rendering reality (learned by testing real venue sites)

Many venue calendars **don't work with a bare fetch**: they're
JS-rendered (events aren't in the static HTML — e.g. Sky Stage) or the
server **403s** a plain request (e.g. Weinberg). So the engine supports
`render: true` per source → it loads the page in a **headless browser**
(Playwright, already a dep; CI installs Chromium). Use plain fetch for
static pages, `render` for JS/blocked ones.

### Configured venue sources (May 2026 research)

The Banyan, Weinberg Center (covers New Spire), Sky Stage, Bushwaller's,
Cellar Door, Bentztown, JoJo's, and The Frederick Center have real sources in
`config/venue-sources.json`. The Derby remains social-only and is left empty
until a permitted first-party source exists. FCPS closings page is captured for
the school-closings profile:
`fcps.org/families_students/weather_delays_closings`.

### The smarter shortcut: aggregators

Several local sources already aggregate **many** venues at once — far
cheaper than per-venue scraping:

- **Frederick Frequency** (frederickfrequency.com) — local live-music calendar
- **Events Frederick** concert calendar (eventsfrederick.com)
- **Bandsintown** (bandsintown.com/c/frederick-md) — has a real API
- **Visit Frederick** live-music listing (visitfrederick.org/events/live-music)
- **Celebrate Frederick** (already ingested via iCal)
  Prefer these as primary sources; fall back to per-venue extraction for
  what they miss.

## "Learning the cadence"

v1: run daily, dedupe, surface only what's new. v2: track each source's
`lastChanged` to infer its rhythm ("posts every Thursday") and check
around that window — adaptive freshness without hammering sites.

## To turn a profile on

1. Fill `urls` in the source config (the agent validates + skips empties).
2. Add standard workspace API keys to GitHub's protected **Data Enrichment**
   environment: `ANTHROPIC_BUSINESS_INFO_API_KEY`,
   `ANTHROPIC_CIVIC_API_KEY`, and `ANTHROPIC_VENUE_EVENTS_API_KEY`. Do not use
   an Anthropic Admin API key.
3. The scheduled GitHub Action runs the agent and commits the refreshed
   data; or `npm run ingest:civic` / `npm run ingest:venues` locally.

## Guarantees (every profile inherits these)

- **Never fabricates** — extracts only what's on the page; failures
  leave prior data untouched.
- **Always sourced** — `{ url, fetchedAt }` on every record → the UI
  shows "via <site> · updated 2d ago."
- **Cheap + safe** — text capped before the model; plain `fetch`, no SDK.
