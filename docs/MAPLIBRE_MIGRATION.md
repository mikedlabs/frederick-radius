# MapLibre migration (task #36 → the swap) — DONE 2026-08-10

The owner directed the map program toward MapLibre + self-hosted county
PMTiles on 2026-08-06. Every GL surface in the app now renders that way.
This file is kept as the record of what moved, what was lost, and the
traps that cost real time, because the same traps apply to any future
basemap work.

## What ships now

The county extract is fetched at build time (`scripts/fetch-basemap.mjs`)
into `public/basemap/`: the PMTiles archive, the Protomaps sprite set,
three Noto glyph stacks over four Latin ranges, and a vendored MapLibre
worker. `src/lib/map/frederickFlavorStyle.ts` builds the style from
`frederickBasemapFlavor.ts`; `src/components/map/useFrederickFlavorStyle.ts`
is the one hook every surface calls.

The current package, worker, and shared worker runtime are pinned together at
MapLibre GL JS 6.3.0. `tests/maplibre-worker-version.spec.ts` blocks a future
package-only upgrade from shipping a mismatched worker pair.

Surfaces, in the order they moved: EventsMapInner, OverheadMap,
CollectClient, ReportClient, AerialTimeMachine, then AppMap + RadiusMap +
TransitMap together. The last three had to move in one commit — they share
fifteen children (MapOverlays, LiveBuses, LiveMarcTrains, FloodContext,
SnowRoutes, RoadWorkZones, the incident and camera pins) and react-map-gl
gives its `/mapbox` and `/maplibre` entries separate React contexts, so a
`Source` from one entry inside a `Map` from the other never finds its
context. Mixed operation is fine *across* surfaces, impossible *within* a
shared component tree.

## What was given up

- **Live traffic flow.** `mapbox-traffic-v1` has no free equivalent and
  MapLibre may not legally serve it. The "Roads now" control and every
  other layer under it — CHART incidents, cameras, road work, snow routes,
  flood context — are unchanged. Lost: 8-minute-old road-speed coloring.
- **Hillshade.** `mapbox-terrain-dem-v1` went with it, so the county
  renders flat and the aerial mode tilts rather than rising. The gate in
  AppMap is still `map.getSource("fr-dem")`, which is false today and true
  again the moment a county hillshade built from USGS 3DEP lands in
  `public/basemap` — no call-site change needed. That is the intended
  follow-up.

## What the swap did NOT touch

Six server-side Mapbox REST APIs remain in real use: Isochrone
(`api/isochrone`), Directions walking (`api/walk-time`),
Directions-Matrix (`api/travel-matrix`, `mapboxMatrix.ts`), Geocoding v6
(`mapboxGeocode.ts`, flag-gated), Search Box
(`api/map/search-fallback`), and Static Images (`api/static-map` → place
and venue mini-maps). All are server-to-server, which is why the browser
CSP now names no mapbox.com host at all.

Mapbox ToS wants Mapbox-API results shown on Mapbox maps. The isochrone
and directions results are now drawn on a MapLibre map, so replacing
those two providers (Valhalla or ORS, needs an owner-provisioned key) is
the next contractual item, not an optimization.

## Traps, all paid for

- **The worker.** Turbopack does not rewrite MapLibre v6's
  `new Worker(new URL(...))`, so the worker is constructed with an empty
  URL and dies. Tile fetching lives in the worker: the map paints its
  background colour and stops, with no error event. Hence the vendored
  worker and `ensureMapLibreWorker()`. Re-copy both files from
  `node_modules/maplibre-gl/dist` on every maplibre-gl upgrade.
- **Glyph directory names.** Write the DECODED stack name to disk. A
  static server decodes `Noto%20Sans%20Regular` before matching, so
  writing the encoded form produces a directory that 404s on every glyph.
- **Font stacks.** MapLibre answers a missing glyph range with a console
  warning and renders the codepoint with a local browser font, so a wrong
  or absent `text-font` yields labels that are subtly wrong rather than
  missing. Every symbol layer must name a vendored stack explicitly;
  silence inherits the spec default of Open Sans, which we do not serve.
  `src/lib/map/mapLabelFonts.spec.ts` enforces both halves.
- **CSS class names.** MapLibre emits `.maplibregl-*` only. Fifty-nine
  `.mapboxgl-*` selectors — attribution positioning, popup chrome, and
  the outside-tap handlers deciding whether a tap hit the canvas — became
  silently dead.
- **`window` during render.** The flavor hook read `window.location.origin`
  in a `useMemo`, which is fine behind `ssr: false` and fatal on
  `/map?mode=radius`, where AppMap renders on the server first.
- **Protocol lifetime.** `addProtocol("pmtiles", …)` is process-global.
  Pairing it with `removeProtocol` on unmount is correct in isolation and
  wrong in an SPA: leaving one map tears the handler out from under every
  other surface. Register once, never unregister.
- **API shape differences** that are type errors, not silent breakage:
  `attributionControl` takes an options object, and `maxBounds` takes a
  flat `[W, S, E, N]` tuple (`toFlatBounds()` in `map/constants.ts`).
- **Byte-serving.** Any server in front of the pmtiles file must answer
  Range requests without re-encoding. Static serving on Vercel is correct;
  a fetch()-based relay forwarded stale content-lengths once.

## Retired along the way

`applyFrederickPalette.ts` (the runtime layer-walk), `frederick-style.json`
and `scripts/build-map-style.mjs` (the baked palette), `mapboxStandardPreview.ts`,
`MapboxTraffic.tsx` + `mapboxTrafficStyle.ts`, the `/admin/basemap` judging
bench, `docs/mapbox-field-guide-style.md`, and the `mapbox-gl` dependency.

## Known red, not caused by this work

Nine map e2e specs fail on this branch; eleven fail on `origin/main`. The
common cause is a dock affordance the specs still expect by its old name
(`Choose what to see` as a button). Fixing that suite is its own concern.
