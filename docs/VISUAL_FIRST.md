# Visual first

**Status:** Owner direction, 2026-10-07. This governs every new surface and
every change to an existing one.
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

Each element takes the highest rung it can reach. A lower rung is still a
picture, so nothing falls back to a wall of text.

**Places**

1. An owner, business-supplied or Google photo that has actually loaded. The
   photo credit renders only after the image loads (`placePhotoFailureSignalSrc`
   and `isPlacePhotoFailureSignal` in `src/components/place/PlaceHeroMedia.tsx`
   are the existing pattern).
2. For frames 96 px and larger, the place's own block on the self-hosted
   MapLibre basemap with a Brick pin. This is real geography, not a
   placeholder, and it costs nothing per load (`docs/MAPLIBRE_SURFACES.md`).
3. For smaller frames, the category mark on the place's own color from
   `src/data/place-hues.json`, as a flat fill. It is a mark, so it must never
   look like a photograph: no gradient, texture or initials.

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

## A budget for prose

- The first screen of every main tab shows at least one real picture, map or
  time strip above the bottom nav.
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
| Owner photography | 108 seasonal photos in `public/images/seasons` (104 geotagged), every geotagged one within 3 km of downtown Frederick, plus 133 From Above photos and a few fair and moment frames. AerialBeat already places an aerial within 800 m on 646 place pages, but it captions the frame with the place's town, so some Walkersville pages show a Frederick frame labeled Walkersville. | Caption aerials from their own geotag and capture month. Then a shoot list: the other twelve towns, the top parks and trails, and the most-viewed places, each published with a credit and date. |
| Businesses | Owners can claim and manage a listing (`src/app/business`), but cannot add a photo. | A reviewed photo upload on the manage page. Owned, free and current. |
| Publisher flyers | 93 of 1,160 upcoming events (8%) carry an approved publisher image, gated by `src/components/event/eventVisuals.ts` (80 of 82 Downtown Frederick Partnership listings). 74 of the 76 distinct DFP URLs arrive through the CDN transform `tr:w-1200,h-675,fo-auto`, already cropped to 16:9. | Show them whole. That needs the untransformed asset, checked to be the publisher's own original. |
| Self-hosted map | The county PMTiles basemap in `public/basemap` (zooms 0 to 15), used on six surfaces with no per-load cost. A place's mini map moves about 41 KB of tiles. 715 of 1,160 upcoming events have a precise geocode. | A mini map for every place page and every precisely geocoded event. Today `PlaceMiniMap.tsx` and `VenueMiniMap.tsx` fall back to a decorative locator grid because static Mapbox images are off in production. |
| Place colors and marks | 1,287 current places have a color in `place-hues.json` (55 more keys are orphaned). The hues were taken from Google photos, so they cannot be rebuilt while the hold lasts. Brewery logos cover 17 of 19 breweries, and 13 of 20 food trucks have marks. Category glyphs cover every place. | The small-frame fallback, in flat color. Brewery and truck logos stay small identifying marks, never photos. |
| Licensed open imagery | 7 verified Wikimedia town photos and 6 landmark photos (`src/lib/integrations/wikimedia.ts`), 15 history photos, and 19 Library of Congress records. Wikimedia rate-limits some widths. | Self-host the Commons files with their credit lines, prefer the landmark photo when a Google photo fails, and replace with owner photos as the shoot list fills in. |

## Baseline, 2026-10-07

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

Eight of fourteen surfaces show no real picture at all, and seven fallback
name plates were visible across those first screens. /events also served a
degraded "1 event listing shown · 1 town · partial results" state repeatedly
between 12:26 and 13:47 UTC, so its visual floor depends on fixing that state
first.

The visual-floor check (build step 2) should start from this table: zero name
plates, and at least one real picture or map of 96 px or more in the first
viewport. It has to state whether pixels under overlaid type count as picture,
because the two probes differ by up to 8 points on photos with titles.

## Surface by surface

- **Today:** the owner photo band follows the season and hour; tonight or
  tomorrow is a map with numbered pins beside time rows; likely-open places are
  picture tiles.
- **Events:** each section leads with flyers shown whole; every row carries a
  flyer thumbnail or its venue's map tile beside the date plate.
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
   the self-hosted basemap.
2. Add a visual-floor check that measures the first viewport of each main tab at
   390 px and fails when a surface that meets the floor regresses. Add each
   surface to the enforced list as it reaches the floor, the same ratchet
   pattern as `scripts/style-lint-baseline.json`.
3. One photo primitive for places and events that follows the ladder above,
   with credits only after load.
4. The picture row primitive (photo or color tile, name, one distinguishing
   fact) for browse, Nearby, Ask and Today.
5. The posted-hours week chart, the tonight and tomorrow map, and the Events
   flyer rail.
6. Owner and business photography supply: the shoot list and the business photo
   upload.
