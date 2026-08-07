# MapLibre migration plan (task #36 → the swap)

Decision context: the owner directed the map program toward MapLibre +
self-hosted county PMTiles (2026-08-06). The bench (`/admin/basemap`) and
full-screen preview (`/admin/basemap/full`) already run the target
architecture end to end: county extract fetched at build time
(`scripts/fetch-basemap.mjs`), flavor style (`flavorStyle.ts` +
`frederickBasemapFlavor.ts`), vendored worker
(`ensureMapLibreWorker()` — Turbopack does not rewrite MapLibre v6's
`new Worker(new URL(...))`; see `flavorStyle.ts` for the war story).

Audited 2026-08-06. Ten GL surfaces exist; nine render Mapbox, one
(`full/FullFlavorPreview.tsx`) is already pure MapLibre.

## What the swap is NOT

Swapping the renderer removes tile/style billing and the Mapbox token
from map *rendering*. It does NOT touch six server-side Mapbox REST APIs
in real use — Isochrone (`api/isochrone`), Directions walking
(`api/walk-time`), Directions-Matrix (`api/travel-matrix`,
`mapboxMatrix.ts`), Geocoding v6 (`mapboxGeocode.ts`, flag-gated),
Search Box (`api/map/search-fallback`), Static Images
(`api/static-map` → place/event minimaps). Those stay on Mapbox until
each gets its own replacement decision (Valhalla/ORS for isochrone +
directions needs an owner-provisioned key; Static Images could become
self-rendered MapLibre snapshots later). Mapbox ToS wants Mapbox-API
results shown on Mapbox maps, so the isochrone/directions replacements
should land in the SAME release as the /radius and walk-route surfaces
they draw on.

## Order of work

1. **Foundation PR** — shared `frederickFlavorStyle` promoted out of
   /admin into `src/lib/map/`; sprites + glyphs vendored into
   `public/basemap/` (fetch-basemap.mjs grows an assets step) so the
   admin relay and the `protomaps.github.io` CSP entry can die.
2. **Leaf surfaces first**, one PR each, to shake out the pattern where
   blast radius is small: TransitMap (also feeds /pulse), EventsMapInner
   (dark style → flavor dusk variant), OverheadMap, AerialTimeMachine,
   ReportClient, CollectClient. Each is: import swap to
   `react-map-gl/maplibre`, css swap, `ensureMapLibreWorker()`, style →
   flavor, type imports `mapbox-gl` → `maplibre-gl`, drop
   `mapboxAccessToken`.
3. **RadiusMap** — carries `setTerrain` (option-shape differs in
   MapLibre) and draws isochrones; pair with the isochrone provider
   swap.
4. **AppMap last**, after the #77 split finishes. Its Mapbox couplings:
   `frederick-style.json` + `applyFrederickPalette.ts` are keyed to
   Streets-v8 layer names and must be REPLACED by the flavor (they are
   the old way of achieving the same brand goal); `mapboxStandardPreview
   .ts` (setConfigProperty) gets deleted, not ported; the
   `mapbox://mapbox.mapbox-terrain-dem-v1` hillshade needs a raster-dem
   alternative (Terrarium tiles on AWS, or drop hillshade initially);
   `mapbox://mapbox.mapbox-traffic-v1` (MapboxTraffic layer) has no free
   equivalent — accept the feature drop; MDOT incident/camera layers
   already cover the need.
5. **Cleanup PR** — CSP entries (`api.mapbox.com`, `events.mapbox.com`,
   `*.tiles.mapbox.com` from `next.config.ts` once no renderer needs
   them; keep whichever REST APIs remain), preconnect hints in
   `layout.tsx` + `map/page.tsx`, `.mapboxgl-*` selectors in e2e specs
   (`discovery-shell`, `map-result-area`, `map-search-selection`) →
   `.maplibregl-*`, and the Mapbox-logo assertions (MapLibre has no
   logo control; attribution text remains mandatory for OSM/Protomaps).

## Gotchas already paid for

- Worker vendoring (`ensureMapLibreWorker`) — mandatory on every
  surface; a missed call renders ground color and nothing else, with no
  error surfaced.
- Byte-serving: any server in front of the pmtiles file must answer
  Range requests without re-encoding (fetch() decompression made a relay
  forward stale content-lengths once; static serving on Vercel is
  correct).
- react-map-gl v8 ships both entry points, so mixed operation during
  the leaf-first rollout is supported — no big-bang required.

## Rollback

Each surface PR reverts independently. Until step 5 removes CSP/tokens,
a revert restores Mapbox rendering with zero config work.
