# GIS feasibility audit — local-intelligence layer

**Read-only audit (June 2026). No implementation.** Question asked: can
Frederick Radius use official GIS (Frederick County, City of Frederick
SpiresGIS, Maryland iMAP) as a *local-intelligence layer on top of the existing
Mapbox map* — not a replacement, not a custom engine? Answer: **yes, and the
foundation is already in production.** This is "extend the layer," not "adopt
GIS."

Sourcing note: the per-layer facts below come from `data/sources.yaml` (an
already-probed catalog — many endpoints were confirmed live, others are flagged
unconfirmed) and the live integration files. Confidence is marked per row.
Nothing here is a guessed endpoint.

---

## 0. What's ALREADY live (the foundation)

GIS is not new to the app — it's a backbone. Existing, in production:

| Layer | Source | Where it renders | Confidence |
|---|---|---|---|
| Municipal boundaries | County GIS (`fcGis.getMunicipalBoundaries`) | `/map` always-on outline | ✅ live |
| Transit route shapes | Frederick County TransIT (`transitFrederick`) | `/map` toggle · `/transit` · `/pulse` | ✅ live |
| Trail lines | County GIS (`fcTrails`) | `/map` toggle · `/trails` | ✅ live |
| Parks (polygons + locations) | County GIS POS_Areas + Park_Locations | `/parks` (address enrichment) | ✅ live |
| Public art | County (`fcArtTour`) | art layer / tour | ✅ live |
| MARC departures + alerts | MTA (`marcTrains`) | `/transit` board | ✅ live |
| Historical aerials 1958–2025 | **City SpiresGIS** `Aerial_<year>/MapServer` | `/from-above` time machine | ✅ live |
| CHART traffic incidents | MDOT (`mdot_chart`) | pipeline source | ⚠️ active but **currently failing** (see BACKLOG data-pipeline issues) |

**The plumbing is proven:** ArcGIS REST `query?f=geojson&outSR=4326` → normalize
→ cache via `next: { revalidate }` → Mapbox GL source. `fcParkLocations.ts` is
the reference implementation. So new layers are low-friction.

---

## 1. Candidate layers (not yet used)

### City of Frederick — SpiresGIS (`spires.cityoffrederick.com/arcgis/rest/services`)
MapServer-only (no FeatureServer); query `f=geojson&outSR=4326`. License: city
GIS page has an accuracy disclaimer but **no explicit license** — production use
needs City IT sign-off (contact in sources.yaml: Matt Bowman, City GIS). Zoning,
Historic District, and Floodplain are explicitly offered by the city for
integration.

| Layer | Geom | Confidence | User value | Disposition |
|---|---|---|---|---|
| Historic District | polygon | ✅ confirmed | High (sense of place, First Visit) | **Pilot** / optional overlay |
| Cultural Assets | point | ✅ confirmed | High (arts, First Visit) | Optional overlay |
| Bike Paths + Path Plan | line | ✅ confirmed | High (Outdoors, With Kids) | Optional overlay |
| Zoning | polygon | ✅ confirmed | Low for normal users | Hidden enrichment |
| Floodplain | polygon | ⚠️ path unconfirmed | Med (Rain Plan, safety) | Optional overlay (verify path) |
| Capital Improvement / Development Review | polygon/point | ✅ confirmed | Low–Med (planner-ish) | Hidden / light "what's changing" digest |
| Snow Removal | line | ✅ confirmed | Med (seasonal, civic) | Seasonal overlay |
| Council Districts | polygon | ✅ confirmed | Low | Hidden enrichment (civic context) |
| HPC Properties | point | ✅ confirmed | Low–Med | Hidden enrichment |
| Parcels (layer 8) | polygon | ✅ confirmed | None (heavy) | **Hidden enrichment only** |
| Address Points + Geocoder | point/service | ✅ confirmed | None directly | **Hidden enrichment** (coords/dedupe) |
| Lead Service Lines | line | ✅ confirmed | — | **NEVER show** (health-sensitive, pending_review) |

### Frederick County GIS (`gis.frederickco.gov` / `maps.frederickcountymd.gov` / `gis-fcgmd.opendata.arcgis.com`)
License: **public, county open data** (cleanest license of the three).

| Layer | Geom | Confidence | User value | Disposition |
|---|---|---|---|---|
| Municipal boundaries | polygon | ✅ live | High (county-wide framing) | **Activate as a mode** (County View) |
| Parks Trails (Cartegraph) | line | ✅ confirmed (layer 0) | High (Outdoors) | Live/extend |
| Park Locations | point | ✅ live | High | Live (enrichment) |
| County facilities / civic buildings | point | ⚠️ scaffold | Med (Civic) | Optional overlay |
| Floodplain / waterways (county) | polygon/line | ⚠️ not yet probed | Med (Rain, water) | Verify then optional |
| Open Data Hub (parcels, facilities) | various | ⚠️ pending_approval | varies | Case-by-case |

### Maryland iMAP (`geodata.md.gov/imap/rest/services`)
License: **public, State of Maryland.** Statewide — clip to county bbox.

| Layer | Geom | Confidence | User value | Disposition |
|---|---|---|---|---|
| State boundaries / physical | polygon | ⚠️ scaffold | Low (county already has) | Skip (duplicate) |
| State parks | polygon | ⚠️ scaffold | Med (Catoctin etc.) | Optional (pairs with NPS, already live) |
| DNR trail atlas | line | ⚠️ pending | Med (Outdoors) | Coverage backstop for county trails |
| Floodplain (FEMA via iMAP) | polygon | ⚠️ pending | Med (Rain Plan) | Alternative to City floodplain |
| Historic places (MD) | point | ✅ `mdHistoricPlaces` exists | Med | Live/extend |

---

## 2. The practical recommendation

### Pilot these 3 first
1. **Historic District + Cultural Assets (City Spires).** Tiny payload, changes
   yearly, license-offered, *distinctly local*. Powers **First Visit** mode and
   a real "you're standing in the historic district" sense of place no generic
   map has. Lowest risk, highest character-per-byte.
2. **County View — activate the municipal boundaries we already draw.** The data
   is already live; the work is *product*, not plumbing: subtle town highlights,
   "you're in Brunswick," per-town framing. This is the single biggest lever
   against downtown bias, and near-zero data risk.
3. **Road closures via CHART (MDOT).** Already a wired source (currently
   failing — fixing it *is* the pilot). Real-time, practical, county-wide roads
   (15/270/70/340) — serves the frustrated/practical user and isn't
   downtown-biased. Pairs with a "getting around" surface.

### Hidden intelligence (power the app, never a visible layer)
Parcels · address points · geocoder · zoning · council districts · HPC
properties. These fix the ~157 mis-geocoded pins, give every place its **real
town + council district**, and replace the paid Google geocoder — pure backend
trust, zero map clutter.

### Never show normal users
Lead service lines · PulsePoint public-safety incidents · restaurant inspections
(all sensitive/privacy-gated) · raw parcels/zoning polygons (heavy + confusing).

### How GIS improves data trust
- **Authoritative coordinates** (City address points/geocoder) fix mis-placed
  pins — the fastest way to kill "this map is wrong" doubt.
- **Boundary polygons** stamp every place with its real municipality → fixes
  downtown bias *and* "is this actually in Thurmont?" doubt.
- **Official provenance** — "© Frederick County GIS" / "City of Frederick GIS"
  reads as government-authoritative, stronger than a Google scrape line.

### County-connected, not downtown-biased
GIS geometry is inherently county-wide (boundaries, trails, waterways, county
roads). Town-boundary highlights + a **County View** mode + per-town framing are
the structural antidote — the map starts explaining the *county*, not just
downtown.

### Map modes GIS supports (and how much)
| Mode | GIS contribution | Non-GIS contribution |
|---|---|---|
| **Tonight** | event-zone framing | hours (fade closed), events |
| **With Kids** | playgrounds, parks, libraries | family category |
| **Rain Plan** | floodplain awareness, "creeks high" (USGS live) | indoor categories |
| **Outdoors** | trails + bike paths + parks + waterways (one cohesive overlay) | weather |
| **Civic** | civic buildings, council districts, "what's changing" digest | meetings/alerts |
| **First Visit** | historic district + cultural assets + downtown framing | curated picks |
| **County View** | municipal boundaries + day-trip zones | town pages |

### Animated overlays — useful vs gimmicky
**Useful (motion clarifies one thing):**
- "What's reachable from here" radius (already exists on `/radius` — extend to map).
- Parking → event walking path (subtle, on event detail / Tonight).
- Creek/trail corridor line with a gentle directional flow — *only* when
  Outdoors/Water mode is on; clarifies the corridor's direction.
- Soft town-boundary highlight when you enter a town — orients.
- Tonight: fade closed places, warm-glow the active areas.

**Gimmicky / harmful (motion decorates or alarms):**
- Constant pulsing zones everywhere → noise, the eye stops seeing it.
- Animated floodplain/zoning fills → alarming and confusing.
- County-wide "radar sweep" / particle effects → pure decoration.
- Animating any public-safety/health data → alarmist, erodes trust.

### Mobile performance risks + what to cache/simplify
- **Polygon weight is the main risk.** Parcels = thousands of polygons → never
  ship to the client; backend-only. Floodplain/zoning → simplify server-side.
- **Pre-fetch + cache as slim static GeoJSON from our own origin** (not
  client→ArcGIS at runtime): avoids ArcGIS latency/uptime/CORS and lets us
  control payload. Boundaries/trails/historic change rarely → long revalidate
  (the parks loader already uses 604800s).
- **Simplify geometry** (`geometryPrecision`, mapshaper/topojson) before load;
  **load-on-mode / in-viewport**, never all layers on at once (use Mapbox
  feature-state + source toggles, as the map already does).

### Effect on the current Mapbox setup
**None disruptive.** Every GIS layer is just another Mapbox GL source (vector
GeoJSON or raster tiles) — exactly what `trailLines` / `transitLines` /
`municipalBoundaries` / the aerials already are. Mapbox stays the renderer; GIS
is the data layer. This confirms the "do not replace Mapbox / no custom engine"
constraint.

---

## 3. Creative read
The app already has the rare thing — official local geometry wired into a real
map. The opportunity isn't more layers; it's **turning the geometry it already
has into modes and sense-of-place** (County View, First Visit, Outdoors), adding
2–3 distinctly-local layers (historic district, waterways, road closures), and
keeping the heavy/sensitive data as silent backend trust. Motion only where it
explains reach, direction, or "what's open now" — never decoration.

That's the line between *a government GIS portal* and *the county finally having
its own living field-guide interface.*

**Next step is a decision, not code:** pick the pilot set, then a scoped PR per
layer (same discipline as the structure pass). No implementation until then.

---

## 4. Owner decision (June 2026) — parked as strategy, gated on the simulation

GIS stays a **parallel research track**. It does NOT jump the queue. Locked
order is unchanged: **#434 UI hygiene → 20-user simulation audit → coffee →
events.** A GIS pilot only earns its place *after* the simulation confirms the
underlying user problems are real.

**Guiding rule:** *Do not show users more GIS. Use GIS to make the app smarter.*
Raw GIS layers are not shown unless they directly help a decision.

Owner's read on the recommendations:
- **County View / town boundaries = strongest move.** Directly serves the
  county-wide thesis, fights downtown bias, makes every town feel real, and the
  data already exists (low risk). Top candidate.
- **Historic District + cultural assets = strong "First Visit" / field-guide
  layer.** Could make the map feel uniquely Frederick — but **subtle and
  contextual, not a giant toggle dump.**
- **Road closures / CHART = practical + trust-building, but treat as a
  reliability/data fix FIRST** (the feed is currently failing), not a flashy
  overlay.
- **Hidden intelligence agreed:** parcels, address points, zoning, geocoder,
  council districts stay behind the scenes (accuracy, town assignment,
  geocoding, trust).

### Possible future pilot shape (do NOT build yet)
- **County View** — town boundaries · town identity framing · "you're in / near
  {municipality}" context · county-wide discovery.
- **First Visit** — historic district · cultural assets · public art · walkable
  route · parking. (subtle/contextual)
- **Getting Around** — road closures · parking · transit/route context (only if
  reliable).

### The simulation must pressure-test these GIS hypotheses
Before any GIS pilot is greenlit, the 20-user simulation audit has to confirm
the problems GIS would solve are real (see `docs/BACKLOG.md` Pass 2.75):
- Do smaller towns feel shortchanged? (→ County View)
- Do visitors need better orientation? (→ County View / First Visit)
- Do people need parking / road context? (→ Getting Around)
- Does the map feel generic? (→ all)
- Does county-wide context help users understand where they are? (→ County View)

If the simulation confirms these, GIS becomes a **targeted product answer**, not
a shiny side quest. If it doesn't, the pilot waits.
