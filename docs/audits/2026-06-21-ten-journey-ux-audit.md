# Ten-journey UX audit — 2026-06-21

A grounded audit of the app across the 10 user-journey types that cover its use
cases. Each journey was traced through the actual routes/loaders/components (not
generic heuristics). Goal: drive a major improvement across all journeys.

## Journeys
1. Tonight / right now · 2. Visitor planning · 3. Eat & drink · 4. Events &
calendar · 5. Map-first · 6. Outdoors & recreation · 7. Family / rainy-day ·
8. Civic & practical · 9. Saver / returning (My Radius) · 10. Specific-need search.

## Per-journey scorecard

| # | Journey | Works | Biggest gap |
|---|---|---|---|
| 1 | Tonight | SkyHero + unified event feed; happy-hour/deals moat | No weekend preview on /today; no "closing soon" urgency; happy-hour blank when none active |
| 2 | Visitor planning | `/plan` deterministic share-by-URL; curated Collections | `/plan` not in nav; no saved/my-plans; no plan→collection or .ics |
| 3 | Eat & drink | Craving-first strip; cuisine facets; verified Brunch | Non-coffee categories' richer UX not rolled out; no price filter |
| 4 | Events | Unified assembly; civic fenced; list↔calendar | Recurring events collapse away dates; no .ics/remind-me; filters lost on back |
| 5 | Map-first | Full-bleed, timeout-guarded, precise time predicates | Default time-mode can land empty; no on-map search; unlabeled layers |
| 6 | Outdoors | Live rivers (USGS + flood stage); dense lists | Parks/trails GIS in fallback; no trail difficulty/elevation; no `/golf` landing |
| 7 | Family | Smart family matching excludes junk; kid tags exist | Rainy-day/kid tags invisible & unfilterable; no entertainment category |
| 8 | Civic | Intent-first contacts/parking/transit; tap-to-call | Voting/polling stub; no live transit (GTFS pending); no new-resident onboarding |
| 9 | Saver | Clean save + sync; town-ranked `/m/[town]` | Downtown default silent; flat saved list; "set town" hidden in Settings |
| 10 | Search | One ranked list; intent boosting; ⌘K everywhere | No distance; no "open now" intent; ignores geolocation; ignores craving vocab |

## Cross-cutting themes (the real levers)

1. **The downtown default (P0).** Unset `fr_home_muni` → every ranked surface
   silently centers on Downtown Frederick, with no affordance to fix it. Hit
   J3/J5/J7/J8/J9/J10. NOTE: the legacy category path already *ranks* from the
   home centroid; the gap was the missing "set your town" affordance when unset.
2. **Shadow data.** Audience tags (kids-*, accessible, groups), price_band,
   indoor/outdoor, rainy-day, seasonal exist in the data but had no UI — not
   shown on detail, not filterable. And they are barely populated (~17 places).
3. **One good pattern not rolled out.** The richer context-aware CategoryView is
   coffee-only; other categories use the (still home-ranked) legacy layout.
4. **Findability.** Best surfaces (Collections, /plan, happy-hour, deals, parks,
   trails, rivers) are orphaned behind "More"; nav stays Today/Map/Events/Saved.
5. **No first-run.** Nothing asks "where are you / visiting?", so personalization
   never starts.

## Program (sequenced for cross-journey impact)

- Phase 1 — downtown-default affordance on ranked pages; surface shadow tags;
  (CategoryView rollout deprioritized once ranking was found already home-aware).
- Phase 1b — populate the shadow tags (derive from existing data) + tag faceting.
- Phase 2 — search distance + "open now" intent; /today weekend preview +
  "closing soon"; findability doorway.
- Phase 3 — saver depth (personal collections/tags); events .ics/remind-me +
  recurring-date clarity; family rainy-day section + entertainment category;
  civic voting/polling + getting-around hub; outdoors parks/trails revive +
  trail difficulty + `/golf` landing.

## Status (this session)
- Done: downtown-default banner on category pages; "Good to know" audience-tag
  row on place detail.
- In progress: tag-population pass, faceting, Phase 2.
