# Frederick Radius live-site audit

**Date:** 2026-07-08  
**Target:** https://frederickradius.app  
**Scope:** public beta gate plus authenticated beta app. Mobile viewport 390x844 and desktop viewport 1280x900.  
**Routes sampled:** `/beta?next=/today`, `/today`, `/events`, first event detail from `/events`, `/map`, `/places/rosatis-pizza-5`, `/trust`, `/about`, `/my-radius`, `/contacts`, global search for `pizza`.

## Summary

The live site now reads as a real local utility, not a prototype. `/today`, global search, `/trust`, and county services are the strongest surfaces. The main remaining site-level risk is perceived reliability: some live-loading states persist after content appears, some time-sensitive labels overstate "live" status, and missing or slow media creates large blank/placeholder areas on otherwise polished pages.

## Route notes

| Surface | What worked | Audit finding |
|---|---|---|
| Beta gate | Clear private-beta framing, strong live proof card: "933 places open across the county" and "21 on today". Password and notify flows are prominent. | The gate now gives enough product proof before asking for a password. Keep the live proof card; it makes the splash page feel operational instead of conceptual. |
| `/today` | Best product surface. Weather, live event, open-now places, location scope, and intent tiles are immediately understandable on phone and desktop. | Network settling is still slow enough that automated browser waits can run long. The visible page is useful, but background data work should not keep the route feeling busy. |
| Global search | Fast and useful. `pizza` returned 12 local place results with town/category/confirmed badges. Mobile search thumbnails loaded well. | Desktop search showed blank thumbnail squares at capture time. If images are not ready, collapse to an icon/category chip instead of showing empty frames. |
| `/events` | Major improvement. The new "What / When / Where" header is clearer than a dense filter rail, and mobile list cards are readable. | Mobile reports horizontal overflow, likely from wide controls/filter rows. Desktop had one large failed/blank image in the hero event card. |
| Event detail | Strong structure: category, title, time, source badge, description, map/parking context. | "Live" can be misleading for long or all-day imported event windows. Example sampled: `Reading of the Declaration of Independence at Catoctin Furnace` displayed `12:00 PM-11:59 PM Live`. That should read as "today" or "all-day listing" unless the event is truly in progress. |
| `/map` | Once loaded, the map is useful and visually on-brand. The top search/filter panel is much clearer than a raw map. | The page still displays "Loading public places from OpenStreetMap..." after markers and counts are visible. Both viewports kept `loadingText=true` in the settled audit. Mapbox also logged missing category sprite warnings (`cat-park`, `cat-ice-cream`, `cat-wellness`, etc.). |
| Place detail | Place pages feel practical: real hero photo, address, save, notes/lists, map links, call, website/menu, nearby context. | Place photo rails still produce failed thumbnail slots. Rosati's showed four bad visible thumbnails on mobile and one on desktop after settling. |
| `/trust` | Strong trust copy. Source/badge definitions are plainspoken and match the product's value prop. | This page is important enough to surface from the beta gate and place cards whenever a badge appears. |
| `/about` | Clear positioning: not a tourism brochure, not a generic directory, not a civic dashboard. | The "made in Frederick" line is a strong credibility signal; keep it visible. |
| `/my-radius` | Honest empty state; explains saved places, events, and routes. | The empty state could offer one-click starter examples from current context instead of only explaining what will happen later. |
| `/contacts` | High-utility civic surface. Emergency and common-request grouping is immediately useful. | This is a differentiator. It should be easier to discover from `/today` and search. |

## Console and loading signals

- `AbortError: Transition was skipped` appeared during route transitions.
- Repeated CSS preload warnings appeared for a Next static CSS chunk.
- Mapbox emitted missing image warnings for multiple category icons. This can cause marker symbol fallbacks or missing sprites.
- A `400 Bad Request` resource appeared during the map pass.
- `/map` still exposed loading copy after the map was visibly populated.

## Priority fixes

1. **Fix live/loading truthfulness.** Hide stale loading messages as soon as the first useful data is available; distinguish "today", "ongoing", "all-day listing", and "live now".
2. **Add media fallbacks.** Large event cards and place photo rails need non-empty category artwork or smaller fallbacks when images fail.
3. **Tighten map sprite loading.** Register or remove missing `cat-*` icons so map warnings do not translate into missing markers.
4. **Reduce mobile overflow in `/events`.** Audit filter/view controls at 390px and make every horizontal scroller intentional.
5. **Improve empty saved state.** Offer starter actions: "Save this event", "Save nearby lunch", or "Build from current town".

## Verdict

The site is past "interesting prototype" and into "useful local product." The next quality bar is not adding more sections. It is making every live claim, loading state, and media frame feel trustworthy under normal network conditions.
