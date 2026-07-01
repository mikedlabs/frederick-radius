# MAP_AUDIT.md — /map page audit (Frederick Radius)

_Read-only audit. No app code was changed to produce this. Evidence is cited as
`file:line`._

> **Design-token note:** the brief cites "Creek blue `#1E4250`, Paper cream
> `#F2EBDA`, Fraunces." That is the **older** spec. The shipped system
> (`src/app/globals.css`, `CLAUDE.md`) is **Signal vermilion `--app-brand`
> `#E14328`, paper `--app-bg` `#EEE6D4`, Newsreader (serif) / Public Sans / JetBrains
> Mono**. The map's runtime recolor (`applyFrederickPalette.ts`) already targets the
> shipped `--app-*` tokens. Anything visual below matches the shipped system.

---

## 1. Architecture at a glance

| Aspect | What ships |
|---|---|
| Route | `src/app/(app)/map/page.tsx` (Server Component, `revalidate = 300`, `maxDuration = 30`) → `AppMapClient` → `AppMap` |
| Map lib | **`react-map-gl/mapbox` + `mapbox-gl`** (`AppMap.tsx:13-15`) |
| Load path | `AppMap` is `dynamic(() => import("./AppMap"), { ssr: false })` (`AppMapClient.tsx:11`) — code-split, does not block first paint |
| Data source | **Static `@/data/places-client.json`** imported at build + `publicPlaces()` slimmed into `OPEN_PLACES` (`page.tsx:33,70`). Events/civic/amenities assembled server-side and passed as props. **No runtime Supabase query for map points.** |
| Marker strategy | **GeoJSON `Source` + `Layer`** (circle/symbol), **clustered** — not DOM markers — for the big place sets (`AppMap.tsx:1465-1770`) |
| Style | **Default `mapbox://styles/mapbox/light-v11`** (`constants.ts:280`) **recolored at runtime** by `applyFrederickPalette()` (`AppMap.tsx:1261`). No custom Studio style. |
| Token | Publishable `pk.` token, env-overridable with a **committed fallback** (`lib/mapbox.ts`) |

**Data flow, plainly:** the whole place dataset (~1,700 rows, slimmed) is shipped
to the client up front as static JSON and rendered into clustered GeoJSON sources.
The map filters the already-loaded set **client-side**; there is no bounding-box
fetch and no Postgres/PostGIS at runtime. `onMoveEnd={emitInView}` (`AppMap.tsx:1268`,
`getBounds` at `:458`) computes which loaded points are in view to feed the in-view
drawer — it is a client filter, not a server fetch. This is **fine and fast at the
current scale** (instant pan, works offline-ish), but it is not viewport-scoped and
will not scale to tens of thousands of points, and it is **not "live from the
database."**

---

## 2. Rubric assessment

Legend: ✅ present · 🟡 partial · ❌ missing · ⏹ stubbed/retired-by-choice

### A. Rendering & performance
| Item | Status | Evidence / notes |
|---|---|---|
| Marker strategy (GeoJSON layers, not DOM) | ✅ | Clustered GeoJSON sources `curated-places`, `osm-businesses` + circle/symbol layers, `AppMap.tsx:1465-1770`. (Event/civic pins are DOM markers — small counts, OK — `:2130`.) |
| Clustering | ✅ | `clusterRadius 64 / clusterMaxZoom 15` (curated) + `48 / 13` (osm) + `clusterProperties`, `:1470-1471,1575-1576,1673-1675`; click-to-zoom via `getClusterExpansionZoom`, `:723-731` |
| Viewport-scoped data | ❌ (by design) | Entire dataset ships as static JSON (`page.tsx:33,70`); `emitInView` filters the loaded set client-side (`:455,1268`). No bbox fetch. Fine now (~1,700), won't scale to 10k+. |
| PostGIS | ❌ | No PostGIS: `schema.ts:18-21` stores plain `bbox_*` doubles, no `geometry`/`geography` type, no GIST, no `ST_` queries. All spatial work is client-side. |
| Load path (code-split, lazy) | ✅ | `dynamic({ssr:false})` (`AppMapClient.tsx:11`); upstreams raced with `withTimeout` (`page.tsx`); mapbox CSS + palette applied on `style.load` |

### B. Interaction & navigation
| Item | Status | Evidence / notes |
|---|---|---|
| Geolocation | ✅ | `GeolocateControl trackUserLocation` (`:2235`) + custom "Near me" `getCurrentPosition`→`flyTo` (`:971-1001`) with graceful `role=status/alert` messages (`:1092,1123`) |
| Camera (fit/min-max/maxBounds/fly) | ✅ | `maxBounds={FREDERICK_MAX_BOUNDS}`, `minZoom/maxZoom` (`:1234-1236`); `smoothFocus` easeTo (`constants.ts:183`); auto-fit intentionally retired (`:697`) |
| Selection → bottom sheet | ✅ | `usePlaceSheet().openSheet(...)` (`:753,880`) — a real bottom sheet, **not** a pin popup |
| Search / geocoder | ❌ | No in-map geocoder/SearchBox. The global header search routes to `/search` (text), not map address geocoding scoped to the county. |
| Filters (category / municipality / layer) | ✅ | Category chips (`activeCats`), tap-a-town municipality resolve (`:87-115,709`), `MapIntentChips`, layer toggles synced to URL |
| Time filtering (now/today/weekend) | 🟡 | `MapTimeChips` exists; drives events/civic; places use precomputed `open_status`. Works, but "right now" is not a single unified pin filter across all layers. |
| List ↔ map sync | 🟡 | In-view drawer via `emitInView` + desktop hover preview (`:270,455,790`). No persistent desktop side-list; sync is drawer + hover, not two-way highlight. |
| Directions handoff | 🟡 | Google Maps dir link (`:927`). Apple Maps / in-app Mapbox Directions not offered from the map selection (PlaceSheet carries the richer actions). |

### C. Live data ("right now")
| Item | Status | Evidence / notes |
|---|---|---|
| Supabase Realtime | 🟡 | **Live buses** poll GTFS-realtime via `/api/transit/vehicles` (`LiveBuses.tsx`) — real live layer, but **polling**, not Supabase Realtime. Events/places are static JSON → new pins do **not** appear without a redeploy/revalidate. |
| Freshness signal | 🟡 | Places carry `last_verified_at` + `open_status`; buses show live ETAs. No consistent per-pin "updated X ago" across layers. |

### D. Deep linking & sharing
| Item | Status | Evidence / notes |
|---|---|---|
| URL state | 🟡 | `layers` synced via `history.replaceState` (`:342-344`); `open` / `amenity` / mode params read on load (`AppMapDeck.tsx:145-149`, `page.tsx:253`). **Center, zoom, and selected item are NOT in the URL** — a panned/zoomed/selected view is not shareable or reload-safe. |
| Share a place + static image | ❌ (on map) | No Mapbox Static Images preview. Sharing is the place URL via PlaceSheet. |

### E. Visual & brand
| Item | Status | Evidence / notes |
|---|---|---|
| Custom Mapbox Studio style | ❌ | Default `light-v11` (`constants.ts:280`) recolored at runtime (`applyFrederickPalette`). `constants.ts:264-276` literally notes a Studio style "would replace this when designed." **Highest-leverage visual change.** |
| Terrain / hillshade | ✅ | `applyFrederickPalette` installs its own `fr-dem` raster-dem source + hillshade layer (`AppMap.tsx:1245-1281`). (Brief assumed missing — it's present.) |
| Custom category markers | ✅ | `installCategoryMarkers` / `categoryMarkers.ts` draw per-bucket SVG icons; `BUCKET_COLOR` palette |
| Legend | ⏹ | Retired by choice (`:1207-1209`) — the icons + in-view drawer act as the key |
| Reduced clutter (hide default POIs) | 🟡 | `applyFrederickPalette` walks + recolors style layers and tones labels; explicit blanket POI-label hiding is not clearly isolated — verify which default POI layers remain. |

### F. Accessibility & resilience
| Item | Status | Evidence / notes |
|---|---|---|
| Keyboard nav / ARIA on markers | 🟡 | Controls have `aria-label`, `role=status/alert/group`, `aria-live` (`:1092,1123,1137,1183`); event DOM pins labeled (`:2130`). **GeoJSON-layer pins are canvas-rendered → not individually keyboard-focusable** (inherent to the layer approach; would need a parallel keyboard list). |
| `prefers-reduced-motion` | ✅ | Aerial fade → 0 (`:327`), LiveBuses glide → 0 (`LiveBuses.tsx:185,250`), `motion-reduce:` classes |
| Label contrast on paper base | 🟡 | Recolored to the paper palette; no formal AA contrast pass on map labels |
| Loading / empty / error states | 🟡 | `loading.tsx` skeleton; pinpoint-first empty state (`:1077`); geo errors surfaced. **No explicit tile-load-failure fallback.** |

### G. Security & ops
| Item | Status | Evidence / notes |
|---|---|---|
| URL-restricted public token | 🟡 **risk** | `pk.` token is publishable (safe to ship), but a **committed fallback token** lives in `lib/mapbox.ts` and is almost certainly **not URL-restricted** in the Mapbox dashboard. Anyone can lift it and burn your quota. |
| Usage monitoring | ❌ | No in-code quota guard; Mapbox dashboard alerts are an owner action |
| Map-interaction analytics | ❌ | No `track()`/Plausible calls in any map component — pin taps and filter usage are not measured |

---

## 3. Enablement checklist (what is NOT turned on)

| Config | On? |
|---|---|
| PostGIS extension + GIST index on geometry | ❌ not used (static JSON, lat/lng doubles) |
| Supabase Realtime on events table | ❌ not enabled (map data is static) |
| Custom Mapbox Studio style URL | ❌ default `light-v11` + runtime recolor |
| Geolocation control + permission handling | ✅ enabled |
| Clustering on the source | ✅ enabled |
| Geocoder / search scoped to county | ❌ not added |
| URL state sync (camera + selection) | 🟡 layers only; camera/selection ❌ |
| Hillshade / terrain layer | ✅ enabled (`fr-dem`) |
| URL-restricted public token | 🟡 not confirmed; committed fallback is unrestricted → treat as ❌ |
| `prefers-reduced-motion` handled | ✅ |

---

## 4. Prioritized recommendations (impact per effort)

### Quick wins (< 1 day each)
1. **Harden the Mapbox token.** Set `NEXT_PUBLIC_MAPBOX_TOKEN` in Vercel, remove the committed fallback in `lib/mapbox.ts` (or keep but rotate), and **URL-restrict the token** to `frederickradius.app` + preview domains in the Mapbox dashboard. _Files:_ `lib/mapbox.ts` (+ dashboard). _Risk:_ low; must set env before removing fallback or the map goes blank.
2. **Map-interaction analytics.** Fire the existing Plausible events on pin tap, cluster expand, filter/layer toggle, and "Near me." _Files:_ `AppMap.tsx` (tap/filter handlers). _Risk:_ near-zero; guides the roadmap.
3. **Camera + selection in the URL.** Extend the existing `replaceState` layer-sync to also write debounced `center`/`zoom` on `moveend` and the selected place slug, and hydrate them on load. Makes any view shareable and reload-safe. _Files:_ `AppMap.tsx:342-344,1268`. _Risk:_ low-medium (guard against fighting `maxBounds`/initial view).
4. **Tile-failure + honest error state.** Add an `onError` fallback card ("map couldn't load — retry") so a tile/network failure isn't a blank canvas. _Files:_ `AppMap.tsx`, `AppMapClient.tsx`. _Risk:_ low.

### High-impact
5. **Custom Mapbox Studio style** (the atlas look) to replace `light-v11` + runtime recolor: muted paper base, vermilion/spruce water+roads, curated label density, POIs off. This is the single biggest visual upgrade and removes the per-load recolor cost. _Files:_ `constants.ts:280` (swap `STYLE_URL`), trim `applyFrederickPalette` to only what Studio can't do. _Risk:_ medium — needs a Studio style built + reduced-motion/contrast re-check; keep the recolor as fallback until parity is confirmed.
6. **In-map geocoder / search scoped to the county.** Mapbox Search Box JS (or a small geocoding call) with a `bbox` = Frederick County and a result → `flyTo` + open sheet. _Files:_ new `MapSearch.tsx` + mount in `AppMap`. _Risk:_ low-medium.
7. **Shareable place previews (Static Images API).** Generate an OG image per place (and per shared map view) so links unfurl richly. _Files:_ `api/og` or a new static-map route + PlaceSheet share. _Risk:_ low.
8. **Unified "right now" pin filter.** Make now/today/weekend + "open now" a single toggle that filters _all_ layers (places by `open_status`, events/civic by time) and reflects in the URL. _Files:_ `AppMap.tsx`, `MapTimeChips.tsx`. _Risk:_ medium.

### Larger bets (propose before building)
9. **Live data via Supabase + PostGIS + viewport queries.** Only worth it if the dataset grows past what static JSON handles well, or you want events/places to appear live without a redeploy: enable PostGIS + GIST, move points to Postgres, fetch by bbox on `moveend` (debounced), and subscribe Supabase Realtime for new/updated pins. Big architecture change; the current static approach is faster for today's scale, so this is a "when live-freshness or scale demands it" move, not now.
10. **Keyboard-accessible pin traversal.** Because pins are canvas layers, add a parallel keyboard-navigable list of in-view pins (roving tabindex) that mirrors the map — closes the a11y gap the layer approach creates.

---

## Recommendation

Do the **quick wins (1-4)** first — token hardening is a genuine security item and
should ship regardless. Then the **custom Studio style (5)** is the highest-leverage
visual bet and squarely matches the "atlas / field guide" goal. Hold the
Supabase/PostGIS/Realtime re-architecture (9) until scale or live-freshness actually
demands it — today's static-JSON + clustered-GeoJSON path performs well and the effort
is better spent on style, search, and shareable URLs.
