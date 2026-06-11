# Frederick Radius — Mapbox field-guide style spec

**Status:** spec for the owner-only Mapbox Studio build (referenced in code
as `P2-1`). This is the upgrade path from the runtime repaint we ship today.

## Honest framing: what we already have vs. what this adds

We do **not** ship a stock basemap. `src/components/map/applyFrederickPalette.ts`
already walks the loaded `light-v11` layers at runtime and repaints them to
Brand Book No. 01 — paper land, slate water, sage parks, warm-ink labels,
taupe roads — suppresses POI clutter, and installs a terrain hillshade.
`countySpotlight.ts` veils everything outside the county and draws the border.

So a custom Studio style is **not** a from-scratch transformation. It is a
focused upgrade. The genuine wins:

1. **Typography — the one thing the runtime repaint cannot do.** Mapbox paint
   can recolor labels but cannot change their *font*. A Studio style can set
   the label text font to **Newsreader** (our serif display face), which is
   the single biggest "this is a field guide, not Google Maps" move left.
2. **No runtime repaint cost or flash.** Today we rewrite paint on every
   `style.load`. A baked style paints correct on first frame — no flicker, no
   main-thread walk over every layer.
3. **Cleaner layer management + versioning.** Layer order, sprites, and glyphs
   are authored once and pinned, instead of pattern-matched by `id.includes()`
   at runtime (which is brittle across Mapbox style updates).

Everything below mirrors the **exact hex values** already in
`applyFrederickPalette.ts`, so the Studio style matches what ships today — only
better-typeset and baked.

## Palette tokens (copy these into Studio)

| Role | Hex | App token | Studio layers to set |
|---|---|---|---|
| Land background | `#F4EFE6` | `--app-paper` | `background`, generic `fill` |
| Landuse lift | `#ECE5D5` | `--app-paper-2` | `landuse`, `landcover` |
| Water fill | `#7FA4BB` | Carroll Creek slate | `water` fills |
| Water line | `#5C8AA8` | `--app-cool-2` | waterway/river/canal/stream lines |
| Parks / green | `#C9D6BB` | `--app-sage` 60% | park, grass, wood, forest, pitch, cemetery |
| Buildings | `#DDD3BF` | warm card | `building` fill @ 0.7 opacity |
| Road — minor | `#D9D2C3` | `--app-border` | residential, service, path, rail |
| Road — major | `#C2B8A0` | — | primary, secondary, main |
| Road — highway | `#A89A7C` | warm taupe | motorway, trunk |
| Label — primary | `#1A1815` | `--app-ink` | settlement, place, state, country |
| Label — secondary | `#6A6862` | `--app-ink-3` | minor roads, natural, water labels |
| Label halo | `#F4EFE6` | paper | all symbol text, halo width 1.2 |

## Layer recipe

**Background / land:** solid `#F4EFE6`. Landuse/landcover fills one step up at
`#ECE5D5`.

**Water:** fills `#7FA4BB`. Waterway/river/canal/stream **lines** `#5C8AA8` at
0.9 opacity, zoom-scaled width `8→1.2px, 12→2.6px, 16→5px` — the Monocacy and
Carroll Creek are the county's spine; give them presence, not a hairline.

**Parks & green** (park, grass, wood, forest, pitch, **cemetery**): `#C9D6BB`.

**Buildings:** fill `#DDD3BF` at 0.7 opacity; fill-extrusion same at 0.55.

**Roads:** highways `#A89A7C`, primary/secondary `#C2B8A0`, everything else
`#D9D2C3`. Keep widths from the base style.

**Labels — the upgrade:**
- Font: **Newsreader** (Regular for places, Medium for settlements). This is
  the headline change. Fall back to `Public Sans` then the Mapbox default.
- Color: settlements/places/state/country `#1A1815`; minor road / natural /
  water labels `#6A6862`.
- Halo: `#F4EFE6`, width 1.2 — a printed-paper outline that holds the warm-ink
  text against the hillshade.
- Consider **JetBrains Mono** for any numeric/elevation labels, to echo the
  app's data-detail convention.

**POI suppression:** hide `poi`, `transit`, `rail-label`, `airport` symbol
layers entirely — the app's own pins are the points of interest. Keep place
and road wayfinding labels.

## Terrain (mirror `installRelief`)

Add a `raster-dem` source `mapbox://mapbox.mapbox-terrain-dem-v1` (tileSize
512, maxzoom 14) and a `hillshade` layer **below roads + labels, above land
fills**:

```
hillshade-shadow-color:    #B4A998
hillshade-highlight-color: #FBF8F1
hillshade-accent-color:    #D9D2C3
hillshade-exaggeration:    0.3
hillshade-illumination-direction: 315
```

Subtle warm light on the Catoctin / South Mountain ridges — topographic
texture, never dark blotches.

## County spotlight

`countySpotlight.ts` (world-box-minus-county veil `#EAE2D2` @ 0.72, easing back
at street zoom, plus a sepia dashed border `#7A6A52` with a brand-brick glow)
is a runtime overlay keyed to our committed boundary. **Leave it in code** — it
depends on app data and zoom-reactive opacity that's cleaner as an overlay than
baked into the style.

## Wiring it in (one-line swaps + cleanup)

1. Build + publish the style in Studio; copy the `mapbox://styles/<you>/<id>` URL.
2. Replace `STYLE_URL` in **`src/components/radius/RadiusMap.tsx`** and the
   `STYLE_URL`/`mapStyle` in **`src/components/map/AppMap.tsx`**.
3. Once the style bakes the palette, **`applyFrederickPalette`'s color loop
   becomes redundant** — but keep `installRelief` and the POI-suppression
   *only if* you did not bake them into the style. Simplest path: bake
   palette + POI-hide + terrain into Studio, then reduce `applyFrederickPalette`
   to a no-op (or delete its call), and keep `installCountySpotlight`.
4. Keep both map components calling `installCountySpotlight` (browse + radius)
   — that stays a runtime overlay.

## Verification (after the swap)

- Both modes (`/map` and `/map?mode=browse`) paint correct on first frame with
  **no repaint flash**.
- Town names render in **Newsreader** (the visible proof the style took).
- POI clutter stays suppressed; the county veil + border still draw.
- Run the prod audit (`scripts/prod-audit.mjs`) and spot-check a never-seen
  URL so ISR serves the fresh style.
- Tap targets and the overlay/Layers controls are unaffected (style-only change).
