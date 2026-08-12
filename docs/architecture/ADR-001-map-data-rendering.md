# ADR 001: Map rendering and data delivery

- Status: Accepted
- Date: 2026-08-11
- Owners: Frederick Radius product and engineering

## Context

The Frederick Radius map has two jobs: make the county understandable at a
glance, then help a person act on one place, event, condition, route, or civic
fact. It is not a general-purpose GIS viewer.

The original browse route embedded the county-wide place catalog in its
server-rendered response. That made the first HTML and React payload carry
roughly 1,700 records before MapLibre, its style, or its tiles could become
useful. At the same time, changing live layers and stable geographic layers
have very different caching and rendering needs.

## Decision

1. The default map stays a restrained, north-up 2D decision surface. Pitch,
   rotation, globe mode, and decorative 3D are not cold-start features.
2. The route shell contains layout, controls, and small task-specific context.
   The county place catalog is fetched from a same-origin, five-minute cached
   URL and warmed in parallel with the MapLibre bundle.
3. The place response is an explicit allowlist of pin fields. Full place
   records, photos, menus, and editorial detail load only when a person opens
   a result.
4. Stable, dense geography belongs in PMTiles or vector tiles. Frequently
   changing, modest live sets may remain bounded GeoJSON. React DOM markers
   are reserved for a small number of interactive objects, not catalogs.
5. Every WebGL result set must have a named, keyboard-operable HTML path. The
   map dock therefore exposes a collapsed list of places currently in view.
6. All Radius map surfaces share the same WebGL2 check, county bounds, zoom
   limits, touch-rotation policy, attribution placement, and tap tolerance.
7. Map performance is measured with low-cardinality, privacy-safe timings.
   Coordinates, searches, place identifiers, feature names, and URLs are never
   included in telemetry.
8. The MapLibre package and its vendored worker/shared runtime are one upgrade
   unit. They must always move together and pass a production build plus mobile
   browser journeys before release.

## Vector-tile threshold

The JSON place source is intentional at the current county scale. Move the
catalog to MVT or PMTiles when any of these conditions is sustained:

- more than 5,000 visible point features;
- the compressed place response exceeds 250 KB;
- mobile p75 parse plus source-load time exceeds 250 ms;
- clustering or filtering becomes a measurable main-thread bottleneck; or
- multiple clients need spatial server queries rather than the complete county
  catalog.

Crossing a threshold triggers a measured migration, not an automatic feature
rewrite. The accessible HTML results path remains regardless of renderer.

## Terrain and visual effects

Terrain and hillshade may appear in focused outdoor or elevation scenes after
a Frederick County extract is packaged from an attributable, redistribution-
safe DEM such as USGS 3DEP. They do not belong on the default county map.
Heatmaps, animated particles, and other effects require a decision question
they answer; visual novelty alone is not sufficient.

## Consequences

- The map shell becomes materially smaller and can begin loading sooner.
- Place details remain authoritative because the catalog is only a locator,
  not a second place database.
- Live feeds can fail independently without taking down the base map.
- Future map features have a clear home and a measurable promotion threshold.
- Accessibility and touch behavior are product requirements, not renderer
  afterthoughts.
