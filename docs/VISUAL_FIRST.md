# Visual first

**Status:** Owner direction, 2026-10-07. This governs every new surface and
every change to an existing one.
**Precedence:** On imagery and missing-photo fallbacks, this doc wins over
`docs/PHOTO_POLICY.md`, `docs/STYLE.md` and `docs/DESIGN_TELLS.md`, except for
the one imagery question still marked "Pending owner call" under Events below.
On palette and type it defers to `docs/brand/BRAND_GUIDE.md`.
**Companions:** `docs/PHOTO_POLICY.md` (where photographs may appear),
`docs/DESIGN_TELLS.md` (what counts as fake or decorative),
`docs/USER_FIRST_INTERACTION_CONTRACT.md` (empty modules and first screens),
and the brand guide's type scale.

## The rule

People take in a photo, a pin on a map or a time on a strip before they read a
sentence. Frederick Radius shows before it tells. Every answer row, card and
first screen leads with a real visual, and prose is kept for what a picture
cannot say.

The product has been text heavy for two reasons. Its imagery depends on a
Google photo supply that is currently failing, and many facts (hours, times,
parking, caveats) are written as sentences when they could be drawn. Fixing
both is the job of this document.

Visual first does not loosen the honesty rules. Every image must be what it
claims to be. A text-only state is a fallback, not a design.

## The honest image ladder

Each element takes the highest rung it can reach. A lower rung still shows
something to look at, so nothing falls back to a wall of text.

**Places**

1. An owner, business-supplied or Google photo that has actually loaded,
   painted through `RadiusPhoto` (`src/components/ui/RadiusPhoto.tsx`). It
   asks the photo proxy for its failure signal, treats a failed or 1 px image
   as missing, and lets the credit render only after the image loads.
   `npm run lint:place-photo` (`scripts/check-place-photo-usage.mjs`, run in
   CI by `.github/workflows/style.yml`) fails when a component outside its
   allowlist paints the photo proxy directly.
2. For frames 96 px and larger, the place's own block on the self-hosted
   MapLibre basemap with a Brick pin (`OwnedMiniMap`). This is real geography,
   not a placeholder, and it costs nothing per load
   (`docs/MAPLIBRE_SURFACES.md`).
3. For smaller frames, the category mark on the place's own color from
   `src/data/place-hues.json`, as a flat fill. It is a mark, so it must never
   look like a photograph: no gradient, texture or initials.

The ladder and `RadiusPhoto` do not agree on the threshold yet. The ladder
moves to the map at 96 px, while `RadiusPhoto` draws the mark in any frame
under 120 px (`RADIUS_PHOTO_MARK_MAX`) and hands larger frames back to the
caller. Settle one number when the map rung moves into `RadiusPhoto`. Until
then, a caller that wants the map draws it itself, as `PlaceHero` does with
`OwnedMiniMap`.

**Events**

1. The publisher's flyer, shown whole at its native aspect ratio on a sunken
   paper panel (`var(--app-bg-sunken)`), from the publisher's untransformed
   original. Never crop it with object-cover and never set type over it.
2. The venue's photo, credited, once it has loaded.
3. The venue's block on the self-hosted map, only when the event has a precise
   geocode (715 of 1,160 upcoming events on 2026-10-07). Plotting an
   area-level venue would be a false picture, so those rows keep the date
   plate.

**Towns, parks and collections**

1. Owner photography, matched to season and hour where possible.
2. Licensed open photography with its credit (the verified `TOWN_PHOTOS` and
   `LANDMARK_PHOTOS` in `src/lib/integrations/wikimedia.ts`, Library of Congress
   material in `src/data/loc-archive.ts`).
3. The place on the county map.

**Time and conditions**

Times sit on a strip, posted hours become a week chart labeled as posted and
dated, dates are plates, the week is a ribbon of days, weather is a glyph and a
number, and live states are a dot. Amber is reserved for a real live state.

**Never**

- A text plate, generated artwork or a stock photo presented as a photograph.
- A photo credit before a photo has loaded.
- Type set over a third-party flyer.
- A random business photo on a category or intent tile (`docs/PHOTO_POLICY.md`
  keeps those tiles typographic).
- Decorative glows, illustration packs, or carousels that hide content to look
  busy.
- An open or closed claim drawn from stale hours. A chart of posted hours is
  allowed only when it says it is posted and when it was checked.

## What counts as a real visual

The rule applies in two places, and each has its own definition.

| Where | What counts |
| --- | --- |
| Row lead (each answer row and card) | A loaded photo, a publisher flyer, a map tile, a category mark or a date plate, picked by the ladder above. |
| First-viewport floor (each main tab's first screen) | A real `<img>`, `<canvas>` or `<video>` of at least 96 x 96 px, as `npm run check:visual-floor` measures it. Category marks, date plates and time strips do not count. |

## A budget for prose

- The first screen of every main tab meets the first-viewport floor above: a
  real photo or map of at least 96 x 96 px above the bottom nav. A time strip
  helps there but does not meet the floor.
- Explanatory prose on a first screen stays to one or two sentences. Labels,
  names, times and data do not count against it.
- A caveat is said once, next to the thing it qualifies, rather than in its own
  paragraph or module.
- Hours, times, counts and status become strips, charts, plates and dots
  wherever the data allows.

## Image supply, as of 2026-10-07

| Source | What exists | What it takes |
| --- | --- | --- |
| Google place photos | 1,328 of 1,570 places carry a photo reference. Overnight on 2026-10-06 every probed photo returned `upstream-400` or `daily-cap`. | References are renewed only by the place refresh that is on Google policy hold (`docs/AGENTS_SCHEDULE.md`). Written authorization brings them back. Until then every surface must look complete without them. |
| Owner photography | 108 seasonal photos in `public/images/seasons` (104 geotagged), every geotagged one within 4.3 km of downtown Frederick, plus 133 From Above photos and a few fair and moment frames. AerialBeat used to place an aerial within 800 m on 646 place pages and caption it with the place's town, so some Walkersville pages showed a Frederick frame labeled Walkersville. It now names the area from the frame's own geotag and capture month and shows it only within about 150 m in the same municipality, which leaves 377 pages. | Aerial captions were fixed in October 2026. Next is the shoot list in `docs/SHOOT_LIST.md`, ranked by real traffic, with every frame published with a credit and date. |
| Businesses | Public claiming is off. `src/app/business/claim/page.tsx` is a coming-soon page, and its header comment makes turning claiming on a deferred owner decision. `/business/manage/[token]` opens only for a claim an admin already approved, so no new owner can add a photo. | Pending owner call: turn public business claiming back on so owners can add a reviewed photo, or keep it off and remove the business photo upload from build step 6. If claiming returns, a reviewed upload on the manage page is owned, free and current supply. |
| Publisher flyers | 93 of 1,160 upcoming events (8%) carry an approved publisher image, gated by `src/components/event/eventVisuals.ts` (80 of 82 Downtown Frederick Partnership listings). 74 of the 76 distinct DFP URLs arrive through the CDN transform `tr:w-1200,h-675,fo-auto`, already cropped to 16:9. | Show them whole. That needs the untransformed asset, checked to be the publisher's own original. |
| Self-hosted map | The county PMTiles basemap in `public/basemap` (zooms 0 to 15), with no per-load cost. A place's mini map moves about 41 KB of tiles. 715 of 1,160 upcoming events have a precise geocode. | Built in October 2026: `OwnedMiniMap` draws the place page hero when no photo loads, the event venue map and the Ask results map, and `CountyOverviewMap` leads /towns and /parks on the same basemap. The decorative locator grid is gone. |
| Place colors and marks | 1,287 current places have a color in `place-hues.json` (55 more keys are orphaned). The hues were taken from Google photos, so they cannot be rebuilt while the hold lasts. Brewery logos cover 17 of 19 breweries, and 13 of 20 food trucks have marks. Category glyphs cover every place. | The small-frame fallback, in flat color. Brewery and truck logos stay small identifying marks, never photos. |
| Licensed open imagery | 7 verified Wikimedia town photos and 6 landmark photos (`src/lib/integrations/wikimedia.ts`), 15 history photos, and 19 Library of Congress records. Wikimedia rate-limits some widths. | Self-host the Commons files with their credit lines, prefer the landmark photo when a Google photo fails, and replace with owner photos as the shoot list fills in. |

## Baseline, 2026-10-07 (history)

This snapshot reflects the app before the visual commits of the same day
(`OwnedMiniMap`, `RadiusPhoto`, the `PlaceCard` picture row and
`CountyOverviewMap`), so it records the starting point, not the current
state. The enforced surfaces and the last recorded share for each are in
`scripts/visual-floor-baseline.json` (its `measured` field gives the date),
and `npm run check:visual-floor` measures production again.

Measured on production at 390 x 844, first viewport between the top bar and
the bottom nav, by two independent probes (`shots/weight/textweight.json` and a
point-sampling second review). Google photos were at their daily cap
throughout, so every place photo request returned a fallback.

| Surface | Real picture or map in the first viewport | Content words |
| --- | ---: | ---: |
| /map | 77.5% (map) | 25 |
| /places/carroll-creek-linear-park-frederick | 28.5% (Wikimedia photo) | 55 |
| /m/frederick, /m/brunswick | 26.9% (town photo) | 75 to 80 |
| /today | 19.1% (owner photo, a June frame in October) | 87 |
| /beer | 14.7% (brewery logos, no photo or map) | 55 |
| /events | 0% | 77 |
| /places/black-hog-bbq-bar | 0% (a 148 px empty hero panel) | 61 |
| /category/restaurant | 0% (two cropped name plates) | 69 |
| /open-now | 0% | 79 |
| /ask (empty) | 0% | 27 |
| /my-radius (first visit) | 0% | 50 |
| /towns | 0% | 140 |
| /parks | 0% | 114 |

At the time, eight of fourteen surfaces showed no real picture at all, and
seven fallback name plates were visible across those first screens. /events
also served a degraded "1 event listing shown · 1 town · partial results"
state repeatedly between 12:26 and 13:47 UTC. Later commits that day
addressed several rows: 263a3f42 replaced the empty place hero panel with a
photo or the place's own block, 62cd05f5 put `CountyOverviewMap` at the top
of /towns and /parks, and c7fea262 stopped failed event reads from shrinking
/events to one listing.

## The visual-floor check

`npm run check:visual-floor` (`scripts/check-visual-floor.mjs`) is the
enforced version of this table. It loads each surface at 390 x 844 as a
first-time visitor and asks one question: does the first viewport, between the
header and the bottom nav, show a real picture or map of at least 96 x 96 px?
An `<img>` counts once it decodes larger than 1 x 1 (so the photo proxy's
failure signal never counts), a `<canvas>` counts because the maps draw into
one, and a `<video>` counts. CSS backgrounds never count, because in this
product they are paper texture. Pixels under overlaid type do count as
picture: the floor asks whether a picture is there, and measuring only the
pixels between letters is what made the two probes above disagree. Anything
under an opaque sheet does not count.

`scripts/visual-floor-baseline.json` is a ratchet. A surface that meets the
floor is enforced from then on, and the check fails when an enforced surface
stops meeting it. `--write` records new measurements and enforces newly
passing surfaces but never drops one; removing a surface from enforcement is
a reviewed edit to the JSON. `.github/workflows/visual-floor.yml` runs it
against production after each successful promotion and on demand. It reports
and never rolls back.

First run against production, 2026-10-07: /today (20.4%), /map (98.9%),
/places/carroll-creek-linear-park-frederick (26.1%), /m/frederick (26.5%) and
/m/brunswick (26.5%) meet the floor and are enforced. The other nine surfaces
measure 0%. /beer reads 0% under this rule because its brewery logos are
smaller than 96 px, and logos are marks rather than pictures. Name plates are
not measured here. The photo proxy's fallback plate no longer carries any
text, and whether a component asks for the failure signal is a static
question that `npm run lint:place-photo` answers (build step 3).

## Surface by surface

- **Today:** the owner photo band in the Today masthead (`todayMastheadPhoto`
  in `src/lib/today/masthead.ts`) follows the season and hour; tonight or
  tomorrow is a map with numbered pins beside time rows (build step 5; until
  then `TonightHeadline` shows the event's approved flyer or photo through
  `RadiusPhoto`); likely-open places are picture tiles.
- **Events:** each section leads with flyers shown whole. Every row with a
  flyer, a credited venue photo or a precise geocode carries one beside the
  date plate in `EventCard`, subject to the pending call below for the dense
  rows; an area-level row keeps the date plate. A map tile on every row needs
  a cheap static image: not one live MapLibre canvas per row (`OwnedMiniMap`
  mounts a full map for each instance, and browsers keep only a limited
  number of WebGL contexts alive at once), and not the paid `/api/static-map`
  route, which is off by default and capped daily. Pending owner call: may
  the dense compact, utility and agenda rows carry a flyer thumbnail or a
  credited venue photo beside the date plate, or do they stay photoless as
  the 2026-06-16 and 2026-07-07 amendments in `docs/PHOTO_POLICY.md` say?
  Until that call is made, `EventCard` keeps those rows as they are.
- **Place pages:** the hero is the photo, or the place's block on the map; posted
  hours and happy hours are a week chart; specials are price tiles; parking is
  icon rows.
- **Map:** places are named on the map, and the overview marks events starting
  soon with labeled pins.
- **Ask:** an answer about places shows a map with numbered pins that match the
  ranked list.
- **Saved:** recently viewed places appear as picture cards on a first visit.
- **Towns and parks:** a county map leads. /towns shows all 13 towns from the
  municipal boundaries already in the repo, with the 7 verified town photos
  and the town on the map for the other 6. /parks pins its 33 parks (32
  distinct points); outlines wait until polygon data exists.

The reviewed mockups for these surfaces live on the design canvas linked from
the October 2026 UI and UX review.

## Build order

1. Replace the locator grid on place and event pages with a real mini map from
   the self-hosted basemap. Built in e97aa641: `OwnedMiniMap`
   (`src/components/map/OwnedMiniMap.tsx`).
2. Add a visual-floor check that measures the first viewport of each main tab at
   390 px and fails when a surface that meets the floor regresses. Add each
   surface to the enforced list as it reaches the floor, the same ratchet
   pattern as `scripts/style-lint-baseline.json`. Built: see "The visual-floor
   check" above.
3. One photo primitive for places and events that follows the ladder above,
   with credits only after load. Built in 3d9720f5: `RadiusPhoto`
   (`src/components/ui/RadiusPhoto.tsx`), guarded by
   `npm run lint:place-photo`. The files on that check's `PENDING` list still
   paint the proxy without the failure signal and should move onto it.
4. The picture row primitive (photo or color tile, name, one distinguishing
   fact) for browse, Nearby, Ask and Today. Built in dcd97c7d: the default
   row of `PlaceCard` (`src/components/place/PlaceCard.tsx`).
5. The posted-hours week chart, the tonight and tomorrow map, and the Events
   flyer rail.
6. Owner and business photography supply: the shoot list and the business photo
   upload. The shoot list, ranked by real traffic, is
   `docs/SHOOT_LIST.md`. Pending owner call: turn public business claiming
   back on so owners can add a reviewed photo, or keep it off and remove the
   business photo upload from this step? Claiming is off today
   (`src/app/business/claim/page.tsx`), so the upload waits until that call is
   made.
