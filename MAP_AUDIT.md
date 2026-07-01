# Map overhaul — audit, plan, and sequencing

_Fresh multi-agent audit (July 2026): 5 parallel readers across rendering/style,
data/pins, layers UX, the Mark flow, and controls/token, synthesized into a plan
and stress-tested by an adversarial completeness critic. This supersedes the
earlier read-only MAP_AUDIT notes._

## Diagnosis (why it's slow + hard to use)

Two structural taxes on every `/map` load:

1. **Runtime recolor.** The Frederick paper-cream look is produced at runtime:
   `applyFrederickPalette` walked ~92 layers of stock `light-v11` and mutated
   paint/layout on the main thread inside `onLoad` — and ran **twice per
   navigation** (it registered both `once()` and a standing `on('style.load')`).
2. **The whole county ships to the client.** `places-client.json` (~1.8 MB,
   ~1,633 places) + ~442 amenities are downloaded and clustered client-side.
   There is no bbox/viewport API and no vector tiles.

UX: ~40 flat layer toggles (heavy), and "Mark a spot" leaves the map for a
full-screen route (a *second* full-screen Mapbox instance — and `/collect` is a
*third*), all using drag-to-center instead of tap-to-place.

## Sequencing (measure → cheap wins → big rebuilds → owner infra)

Per the critique: **measure before the owner refactors**, and treat a11y /
reduced-motion / hydration / offline as **acceptance criteria** on the rebuilds,
not follow-ups.

### Slice 1 — measure + safe speed wins ✅ SHIPPED (branch)
- Single palette pass per style load (was 2×/nav); disposer; `fr-palette`
  `performance.measure` so the recolor cost is provable on prod.
- `mapPerf`: mark onload + first idle → report `onload→idle` once via analytics.
- amenity `minzoom` floor fixed (icons 11→10) so a toggled layer is never
  partially invisible between z10–z11.
- All unit-tested with a fake GLMap + mocked `performance` (no tiles).

### Slice 1b — remaining cheap wins (next, in-sandbox)
- Lazy-load `AERIAL_MANIFEST` (104 pts) out of the initial bundle (opt-in layer).
- Saved-only lens via a Mapbox `filter` expression instead of rebuilding 1,633
  features; trim `useMemo` deps so unrelated zoom never rebuilds the collection.
- `AppMapClient` dynamic-import fallback: a loading skeleton matching the map's
  radius/border tokens.

### Slice 2 — Layers sheet redesign (in-sandbox, jsdom-testable)
Five grouped accordions from one config (Places by type · Amenities as a
first-class icon grid · Situation/live · Discovery · County GIS), a "Suggested
for you" default chip row from `mode-defaults.ts`, URL + `localStorage`
persistence alongside the existing `?c=` writer. Move Coffee/Churches (+ raw
hexes) into a `FEATURED_CATEGORIES` constant so all chips render from one loop.
**Acceptance criteria:** accordion a11y (aria-expanded/controls, roving
tabindex, focus mgmt), contrast-checked swatches, effect-gated persistence (no
hydration mismatch), honest "Coming soon" states, ≥44px targets, field-guide
voice. Count badges are a separate follow-up (data-shape change).

### Slice 3 — In-context Mark (in-sandbox UI; geocode is owner-adjacent)
Convert the FAB to a mark-mode trigger; tap/long-press drops a pin at the touch
coord; a light half-sheet over the still-pannable map (category chips → Submit,
detail collapsed); success flashes a marker in place, no navigate-away. Keep
`/report` as a noindex fallback. **Decide:** subsume `/collect` (the third
full-screen map) into the same two-mode sheet. **Acceptance criteria:** gesture
ownership (sheet drag vs map pan), aria-live on mark-mode + pin-drop, reduced-
motion gating on the new crosshair/checkmark, offline submit queue, and DO NOT
weaken the hazard-photo/spam gate without owner sign-off.

## Owner actions (cannot be done/verified in-sandbox)

1. **Bake a Mapbox Studio style** (biggest first-paint win): fork `light-v11`,
   apply the Brand Book hexes + POI suppression + hillshade + county spotlight at
   design time, publish, set `STYLE_URL` (constants.ts), and **flag off** the
   runtime palette pass when the baked style is active (don't run both). Snapshot
   the current look first — the runtime hexes are the source of truth.
2. **Token hardening (reclassified):** the committed token is a *publishable*
   `pk.` token (ships by design — not a secret leak). Action = **URL-restrict**
   it to the prod/preview origins and **split out a separate server token** for
   the isochrone + geocoding routes first, or restriction breaks server calls.
3. **Viewport data** (`/api/map/places?bbox=` and/or offline PMTiles): drops the
   1.8 MB static import. **Gate on:** measured need (Slice 1 marks on prod), an
   offline/SW-cache design (an installed PWA currently works offline; a naive
   fetch-on-idle would show an empty map with no signal), and a clustering-parity
   test. Highest-risk, least-reversible — do it LAST.
4. **Server-side bbox scoping** for civic (MDOT CHART), 311, and reports feeds.
5. **Reverse-geocoding** for the Mark confirmation line (server Geocoding token);
   ship the Mark sheet with the location line hidden until this exists.

## Verified non-issues (do NOT re-fix)
- OSM cache TTL is honored (`constants.ts` `OSM_CACHE_TTL_MS`).
- civic/transit/trails/aerial DO render in the active-filters strip (audit
  self-retracted).
