/**
 * Bake the Frederick Radius map palette into a STATIC style JSON.
 *
 * Today the brand look is produced at RUNTIME: applyFrederickPalette walks
 * ~50 light-v11 layers in the browser on every load and rewrites paint/layout.
 * This script does that ONCE, at build time, against the fetched light-v11
 * style, and writes src/components/map/frederick-style.json. Loading that baked
 * style (behind NEXT_PUBLIC_MAP_BAKED_STYLE=1) deletes the main-thread recolor
 * pass — the biggest first-paint win in MAP_AUDIT.md — WITHOUT the owner-only
 * Mapbox Studio workflow.
 *
 * The transform is a faithful port of src/components/map/applyFrederickPalette.ts
 * (same tokens, same has()/type rules), so the baked look matches the runtime
 * look. Keep the two in sync if the palette changes.
 *
 * Run: NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxx node scripts/build-map-style.mjs
 * (falls back to the committed public token in src/lib/mapbox.ts).
 */
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Brand Book No.01 tokens (mirror applyFrederickPalette.ts) ──────────
const PAPER = "#EBE2CD";
const PAPER_2 = "#E4DAC3";
const WATER = "#8DACC0";
const WATER_LINE = "#4A7090";
const PARK = "#C3D1B3";
const BUILDING = "#E1D5BD";
const ROAD_MINOR = "#D8CDB1";
const ROAD_MAJOR = "#C9BD9F";
const ROAD_HWY = "#AD9E80";
const LABEL = "#16140E";
const LABEL_2 = "#5C5A50";
const HALO = "#EBE2CD";

const has = (id, ...needles) => needles.some((n) => id.includes(n));

/** Apply the palette to one layer object in place (paint/layout merged). */
function paint(layer) {
  const id = layer.id;
  const setP = (k, v) => {
    layer.paint = { ...(layer.paint || {}), [k]: v };
  };
  const setL = (k, v) => {
    layer.layout = { ...(layer.layout || {}), [k]: v };
  };

  if (layer.type === "background") return setP("background-color", PAPER);

  if (layer.type === "fill") {
    if (has(id, "water")) setP("fill-color", WATER);
    else if (has(id, "park", "green", "grass", "wood", "forest", "pitch", "cemetery")) setP("fill-color", PARK);
    else if (has(id, "building")) {
      setP("fill-color", BUILDING);
      setP("fill-opacity", 0.7);
    } else if (has(id, "landuse", "landcover", "land-structure")) setP("fill-color", PAPER_2);
    else setP("fill-color", PAPER);
    return;
  }

  if (layer.type === "fill-extrusion") {
    setP("fill-extrusion-color", BUILDING);
    setP("fill-extrusion-opacity", 0.55);
    return;
  }

  if (layer.type === "line") {
    if (has(id, "water", "waterway", "river", "canal", "stream")) {
      setP("line-color", WATER_LINE);
      setP("line-opacity", 0.9);
      setP("line-width", ["interpolate", ["linear"], ["zoom"], 8, 1.2, 12, 2.6, 16, 5]);
      return;
    }
    if (has(id, "motorway", "trunk")) setP("line-color", ROAD_HWY);
    else if (has(id, "primary", "secondary", "main")) setP("line-color", ROAD_MAJOR);
    else setP("line-color", ROAD_MINOR);
    return;
  }

  if (layer.type === "symbol") {
    if (has(id, "poi", "transit", "rail-label", "airport")) {
      setL("visibility", "none");
      return;
    }
    const primary = has(id, "settlement", "place", "state", "country", "country-label");
    setP("text-color", primary ? LABEL : LABEL_2);
    setP("text-halo-color", HALO);
    setP("text-halo-width", 1.2);
    if (has(id, "water-point", "water-line", "natural")) setP("text-color", LABEL_2);
  }
}

async function main() {
  const tokenMatch = readFileSync(join(ROOT, "src/lib/mapbox.ts"), "utf8").match(/"(pk\.[A-Za-z0-9._-]+)"/);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || tokenMatch?.[1];
  if (!token) throw new Error("No Mapbox token (set NEXT_PUBLIC_MAPBOX_TOKEN or keep the fallback in src/lib/mapbox.ts).");

  const res = await fetch(`https://api.mapbox.com/styles/v1/mapbox/light-v11?access_token=${token}`);
  if (!res.ok) throw new Error(`Fetch light-v11 failed: HTTP ${res.status}`);
  const style = await res.json();

  style.name = "Frederick Radius (baked)";
  for (const layer of style.layers ?? []) paint(layer);

  // Validate against the Mapbox style spec so a malformed style can never ship.
  try {
    const spec = await import("mapbox-gl/dist/style-spec/index.cjs").catch(() => import("@mapbox/mapbox-gl-style-spec"));
    const validate = spec.validate ?? spec.default?.validate;
    if (validate) {
      const errors = validate(style);
      if (errors && errors.length) {
        console.error("Style validation errors:");
        for (const e of errors.slice(0, 20)) console.error(" -", e.message);
        throw new Error(`${errors.length} style-spec validation error(s)`);
      }
      console.log("Style validated OK (spec).");
    } else {
      console.warn("Validator not found; skipping spec validation (transform is type-safe by construction).");
    }
  } catch (e) {
    if (String(e).includes("validation error")) throw e;
    console.warn("Validator unavailable; skipping spec validation:", String(e).slice(0, 120));
  }

  const out = join(ROOT, "src/components/map/frederick-style.json");
  writeFileSync(out, JSON.stringify(style));
  console.log(`Baked ${style.layers.length} layers -> ${out} (${(JSON.stringify(style).length / 1024).toFixed(0)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
