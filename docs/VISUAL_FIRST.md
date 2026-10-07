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

1. The publisher's flyer, shown whole at its native aspect ratio on an Ink
   panel. Never crop it with object-cover and never set type over it.
2. The venue's photo, credited, once it has loaded.
3. The venue's block on the self-hosted map, then the date plate.

**Towns, parks and collections**

1. Owner photography, matched to season and hour where possible.
2. Licensed open photography with its credit (the verified `TOWN_PHOTOS` in
   `src/lib/integrations/wikimedia.ts`, Library of Congress material in
   `src/data/loc-archive.ts`).
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
| Owner photography | 108 seasonal photos in `public/images/seasons` and 104 geotagged aerials. Every geotagged photo is within 3 km of downtown Frederick. | A shoot list: the other twelve towns, the top parks and trails, and the most-viewed places, each published with a credit and date. |
| Businesses | Owners can claim and manage a listing (`src/app/business`), but cannot add a photo. | A reviewed photo upload on the manage page. Owned, free and current. |
| Publisher flyers | Approved event images from Downtown Frederick Partnership and venue feeds, gated by `src/components/event/eventVisuals.ts`. | Show them whole. |
| Self-hosted map | The county PMTiles basemap in `public/basemap`, used on six surfaces with no per-load cost. | A mini map for every place and event page. Today `PlaceMiniMap.tsx` and `VenueMiniMap.tsx` fall back to a decorative locator grid whenever static Mapbox images are disabled. |
| Place colors and marks | 1,342 places have a color in `place-hues.json`; 8 brewery woodcuts and 13 food truck marks exist. | The small-frame fallback, in flat color. |
| Licensed open imagery | 13 verified Wikimedia town photos and the Library of Congress archive. | Town and collection images with credits, replaced by owner photos as the shoot list fills in. |

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
- **Towns:** owner or licensed photography leads, with the town outline on the
  county map.

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
