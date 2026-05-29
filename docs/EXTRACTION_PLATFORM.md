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

## Live profiles
| Profile | Source kind | Output | Agent |
| --- | --- | --- | --- |
| **Municipal civic** | town gov pages | `municipal-civic.json` | `ingest-municipal-civic.ts` |
| **Venue events** | venue sites (Banyan, Derby, Sky Stage…) | `venue-events.json` | `ingest-venue-events.ts` |

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
2. **Permitted API + Claude vision** — read the posted graphic *if* we
   have page access. Elegant, gated on access.
3. **30-second human-in-the-loop** — paste the post/image weekly; Claude
   extracts; publishes. Reliable fallback.

## Rendering reality (learned by testing real venue sites)
Many venue calendars **don't work with a bare fetch**: they're
JS-rendered (events aren't in the static HTML — e.g. Sky Stage) or the
server **403s** a plain request (e.g. Weinberg). So the engine supports
`render: true` per source → it loads the page in a **headless browser**
(Playwright, already a dep; CI installs Chromium). Use plain fetch for
static pages, `render` for JS/blocked ones.

### Configured venue sources (May 2026 research)
The Banyan, Weinberg Center (covers New Spire), Sky Stage, Bushwaller's,
Cellar Door, Bentztown — real URLs in `config/venue-sources.json`, all
`render: true`. JoJo's + The Derby are social-heavy → left empty until a
non-social source exists. FCPS closings page is captured for the
school-closings profile: `fcps.org/families_students/weather_delays_closings`.

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
2. Add `ANTHROPIC_API_KEY` as a repo secret.
3. The scheduled GitHub Action runs the agent and commits the refreshed
   data; or `npm run ingest:civic` / `npm run ingest:venues` locally.

## Guarantees (every profile inherits these)
- **Never fabricates** — extracts only what's on the page; failures
  leave prior data untouched.
- **Always sourced** — `{ url, fetchedAt }` on every record → the UI
  shows "via <site> · updated 2d ago."
- **Cheap + safe** — text capped before the model; plain `fetch`, no SDK.
