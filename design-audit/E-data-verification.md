# E. Data Defect Verification (Section 7 prerequisites)

This report verifies the five known defect classes named in the redesign directive before any UI work depends on them. Method: direct inspection of `src/data/places-client.json` (1,644 places), the hours machinery in `src/lib/hours.ts`, and live checks against production on 2026-06-12.

## 1. Timezone handling: SOUND

The open-now predicate computes "now" through `Intl.DateTimeFormat` with an explicit `timeZone: "America/New_York"` (`src/lib/hours.ts:8`). Status is recomputed live at render time (`src/lib/loaders/places-client.ts:66`), not served from the build-time bake. Two production observations on the same evening showed the open-now count falling from 138 to 97 as shops closed, which confirms live recomputation. Event JSON-LD carries correct offsets (`2026-06-20T11:00:00-04:00`, correct EDT for June). No timezone blocker exists.

## 2. Duplicate places: SOUND

A sweep of all 1,644 places found zero exact-name pairs within 500 meters. A fuzzy pass (shared 10-character name prefix within 120 meters) produced 17 candidates, of which manual review confirms at most 3 true duplicates. The clearest is "W a Tolbard Heating and Ac LLC" and "Wa Tolbard Heating and Air Conditioning". The remainder are legitimately distinct places with related names (a distillery and its bar, a railroad and its station). Deduplication is not a blocker. The 3 candidates belong in `places-overrides.json` as folds.

## 3. Hours coverage: 79.6 percent, USABLE WITH HONEST UNKNOWNS

1,309 of 1,644 places carry verified hours. The shared predicate already refuses to count "unverified" and "unknown" states as open, so the open-now UI never lies; it undercounts. This is the correct premium behavior. The 335 unverified places are the improvement backlog, not a blocker.

## 4. Event link integrity: SOUND

15 of 15 sampled event detail pages returned 200, and 15 of 15 outbound source links (county calendar, venue sites) resolved successfully. No rot found.

## 5. Event description quality: DEFECT, NOT A BLOCKER

2 of 15 sampled events render a metadata dump as their description (a list of county council member names on both Juneteenth entries). The boundary normalizer in `src/lib/events/normalize.ts` misses the "officials roster" pattern. This is a content-quality defect that any editorial surface will amplify. Fix the normalizer pattern before the Daily Cover concept ships. The two Juneteenth entries (county and city) also warrant a duplicate-event review.

## 6. Hero imagery: RESOLUTION SOUND, CURATION ABSENT

88.6 percent of places (1,456 of 1,644) carry a Google photo. A 12-image sample measured typical widths of 1,200 px (range 500 to 1,200), which is adequate for a 390 pt mobile hero at 2x density. The open problem is editorial quality, not resolution: these are uncurated Google Places submissions (storefronts, food close-ups, interiors at random angles). An image-led hierarchy needs either a curation pass over the top 100 to 200 editorial places or a uniform photographic treatment (disciplined crop ratios plus a consistent tonal treatment) that makes mixed sources read as one voice. No design system survives raw, untreated feeds in hero positions.

## Verdict for the program

No hard blockers. Timezone, deduplication, and link integrity are sound. Two items enter the program backlog as prerequisites for specific features: the normalizer gap (before editorial event surfaces) and the imagery treatment standard (before any image-led direction ships).
