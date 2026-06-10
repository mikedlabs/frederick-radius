# Speed findings and handoff notes

**Measured against production on June 10, 2026.** This document records what
the speed pass shipped, what it proved, and the exact root causes behind the
two Section 8 gates that still fail, so the screen-reduction work can fix the
causes rather than the symptoms. All numbers below come from curl and
Playwright runs against the live site, not from local builds.

## Where the gates stand

| Gate | Target | Measured | State |
|---|---|---|---|
| /events initial HTML | under 300 KB | 782 KB | failing, root-caused below |
| /today initial HTML | under 250 KB | 343 KB | failing, root-caused below |
| /today TTFB | under 800 ms | 0.9 to 3.3 s, high variance | failing, root-caused below |
| / (home) TTFB | under 800 ms | 0.25 s | passing |
| /map TTFB | under 800 ms | 0.45 s | passing |
| Nonexistent event slug | HTTP 404 | 404 | passing, hold it |

## What shipped in this pass

1. **AVIF ahead of WebP plus a 31 day optimized-image cache floor**
   (next.config.ts). Verified serving on every route. Measured effect was
   modest (place page images 267 KB to 253 KB; home neutral) because the
   seasonal-photo pipeline already compresses aggressively. The cache floor
   is the durable win: repeat visits stop re-fetching identical heroes.
2. **Event description cap at the /events client boundary** (160 chars).
   Verified live: 787 KB to 782 KB. The negative result is the finding; see
   the next section.

## Root cause 1: /events payload is card count, not field size

Slimming the heaviest per-row field moved the payload less than one percent.
The page serializes every event twice (rendered HTML plus the React Flight
script payload; measured split 47/52). With roughly 164 card nodes and the
full dataset handed to the client explorer, the only fix that reaches the
300 KB gate is rendering fewer events per request:

- Cap the initial server render near 30 events (the data brief, section 4.5).
- Move the "Browse and search all" explorer to fetch on demand instead of
  receiving `allEvents` as a serialized prop. Until then, every collapsed
  CollapsibleSection still ships its full markup; `hidden` hides pixels, not
  bytes.
- The civic and municipal calendar block (the 235 series) should lazy-load
  on expand for the same reason.

## Root cause 2: /today is dynamically rendered on every request

`revalidate = 300` is set, but the page reads `searchParams` (the `?t=` tab
param) in the server component, which opts the route out of ISR entirely.
Every visitor pays full SSR, which is the 0.9 to 3.3 s TTFB and most of the
LCP problem. The compare point: the home page, which is ISR-cached, holds a
steady 0.25 s.

The fix recipe, whichever session restructures /today:

- Stop reading `searchParams` on the server. Render the default tab
  server-side and let TodayTabs switch windows client-side (the per-mode
  event slices are already computed; they can hydrate as props or fetch on
  switch). Once `searchParams` is gone, the existing `revalidate = 300`
  makes TTFB match the home page.
- The blocking `await getOpenNowCount` then runs at revalidation time, not
  per request, so it stops mattering.

## Verified non-problems (do not spend time here)

- **External scripts.** Production HTML loads zero external scripts. The
  "SSL certificate error" in headless runs is the sandbox egress proxy, not
  production. Plausible is unconfigured and renders nothing.
- **Service worker.** 5.4 KB, precaches only /offline, /guide, and two
  icons. Nothing to trim.
- **Fonts.** Four variable files, about 158 KB, cached after first view.
  Fraunces italic is in real use (pull quotes on category, town, event
  surfaces), so the only trims left are aesthetic tradeoffs worth perhaps
  30 KB on first visit. Weight-list edits buy nothing because the files are
  variable.
- **Images config.** AVIF and long cache now in place; the remaining image
  bytes track content choices, not configuration.
