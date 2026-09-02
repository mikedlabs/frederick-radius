# MapLibre surfaces

The app renders maps with **two** engines. This file covers the MapLibre half
and the traps that come with it.

> This replaces MAPLIBRE_MIGRATION.md, which described a total migration to
> MapLibre. That migration happened in August 2026 and was then partly
> reversed by PR #1552, which put the flagship surfaces back on Mapbox. The
> old file kept asserting "every GL surface in the app now renders that way"
> and listing traffic and hillshade as lost, all of which stopped being true
> the day #1552 merged. The migration narrative is gone; the operational
> knowledge below is still live and still governs five production surfaces.

## Who renders what

| Engine | Surfaces |
| --- | --- |
| **Mapbox GL 3.27** — `mapbox://styles/mapbox/standard` via the field-guide config, DEM hillshade, live traffic | `/map`, `/map?mode=radius`, `/transit`, plus the AppMap embeds on `/beer`, `/trails`, `/my-radius`, and the fifteen shared overlay children |
| **MapLibre GL 6.3** — self-hosted county PMTiles, no token, no per-load billing | `/events` map view (`EventsMapInner`), `/overhead`, `/collect`, `/report`, `/from-above/time-machine` |

The split is not arbitrary and it is not a migration in progress. Mapbox
carries the immersive surfaces because it supplies terrain and traffic that
MapLibre has no licensed equivalent for. MapLibre carries the locator and
field-tool surfaces because they need a plain, cheap, reliable basemap and
those five would otherwise bill per load for nothing.

The two cannot be mixed **within** one component tree: react-map-gl's
`/mapbox` and `/maplibre` entries have separate React contexts, so a `Source`
from one inside a `Map` from the other never finds its context. Mixing across
surfaces is fine, which is what ships today.

## What the MapLibre half is made of

`public/basemap/` is a tracked, promoted deployment snapshot: the county
PMTiles archive, the Protomaps sprite set, three Noto glyph stacks over four
Latin ranges, and a vendored MapLibre worker. `src/data/basemap-release.json`
describes it with a sha256 per asset, `scripts/basemap-release.mjs` verifies
those digests offline, and `prebuild` runs `basemap:verify` so a build cannot
ship drifted assets. `scripts/fetch-basemap.mjs` is an explicit candidate
materializer, never a build hook.

`src/lib/map/frederickFlavorStyle.ts` builds the style from
`frederickBasemapFlavor.ts`. `src/components/map/useFrederickFlavorStyle.ts`
is the one hook every MapLibre surface calls.

Package, worker, and shared worker runtime are pinned together at 6.3.0;
`tests/maplibre-worker-version.spec.ts` blocks a package-only upgrade from
shipping a mismatched worker pair.

## Traps, all paid for

Every one of these still applies to the five surfaces above.

- **The worker.** Turbopack does not rewrite MapLibre's
  `new Worker(new URL(...))`, so the worker is constructed with an EMPTY url
  and dies. Tile fetching lives in the worker, so the map paints its
  background colour and stops — with no error event. Hence the vendored
  worker and `ensureMapLibreWorker()`. Re-copy both files from
  `node_modules/maplibre-gl/dist` on every maplibre-gl upgrade.
- **Glyph directory names.** Write the DECODED stack name to disk. A static
  server decodes `Noto%20Sans%20Regular` before matching, so writing the
  encoded form produces a directory that 404s on every glyph.
- **Font stacks.** MapLibre answers a missing glyph range with a console
  warning and renders the codepoint with a local browser font, so a wrong or
  absent `text-font` yields labels that are subtly wrong rather than missing.
  Every symbol layer must name a vendored stack explicitly; silence inherits
  the spec default of Open Sans, which we do not serve.
  `src/lib/map/mapLabelFonts.spec.ts` enforces both halves.
- **CSS class names.** MapLibre emits `.maplibregl-*`, Mapbox emits
  `.mapboxgl-*`. With both engines shipping, a selector written for one is
  silently dead on the other — attribution positioning, popup chrome, and the
  outside-tap handlers that decide whether a tap hit the canvas all depend on
  getting this right per surface.
- **`window` during render.** The flavor hook must not read
  `window.location.origin` in a `useMemo`. That is fine behind `ssr: false`
  and fatal on a surface that server-renders first.
- **Protocol lifetime.** `addProtocol("pmtiles", …)` is process-global.
  Pairing it with `removeProtocol` on unmount is correct in isolation and
  wrong in an SPA: leaving one map tears the handler out from under every
  other surface. Register once, never unregister.
- **API shape differences** that are type errors rather than silent breakage:
  `attributionControl` takes an options object, and `maxBounds` takes a flat
  `[W, S, E, N]` tuple (`toFlatBounds()` in `map/constants.ts`).
- **Byte-serving.** Any server in front of the pmtiles file must answer Range
  requests without re-encoding. Static serving on Vercel is correct; a
  fetch()-based relay forwarded stale content-lengths once.

## Mapbox APIs are a separate question

Six server-side Mapbox REST APIs are in use regardless of which engine draws
the pixels: Isochrone, Directions walking, Directions-Matrix, Geocoding v6,
Search Box, and Static Images. All are server-to-server. Mapbox's terms want
Mapbox-API results shown on Mapbox maps, so isochrone and directions results
drawn on a MapLibre surface remain the open contractual item.

The server APIs never borrow the publishable browser token. Static Images,
walking Directions, and Isochrone each have their own disabled-by-default
runtime switch and a code-bounded Eastern-day request cap. A cache miss reserves
one request atomically before Mapbox; cache hits do not reserve or spend. Matrix
uses the same fail-closed pattern in billed elements.

Search Box billing lifecycle is server-owned. Migration `0045` stores only a
hash of the opaque UUID and closes it after retrieve, 180 seconds, or 50
suggestions. The UI rotates after retrieve and can reopen the same temporary
result only from a five-minute, twelve-item tab-memory cache. Search text,
coordinates, suggestions, and retrieved features are never persisted.
