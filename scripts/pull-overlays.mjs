#!/usr/bin/env node
/**
 * Pull and simplify the county GIS overlays (data brief 6.3).
 *
 * The map never calls ArcGIS at runtime; overlays are committed static
 * GeoJSON. This is the pull step: it hits the Frederick County GIS REST
 * endpoints, strips each feature to the few properties the map popup
 * needs, rounds coordinates to about 1 meter, and writes
 * public/overlays/<layer>.geojson. Run it, review the diff, commit.
 *
 * This is the mechanism the brief's nightly job runs. Sources are the
 * verified endpoints from Section 10's registry. Usage:
 *   node scripts/pull-overlays.mjs
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const LAYERS = {
  // Parks merges TWO source layers into one overlay file: the named
  // points (tappable markers) and the park POLYGONS (soft sage fills).
  // MapOverlays splits by geometry at render time, so one layer = one
  // file stays true. Polygons round to 4 decimals (~11m) — fill shapes
  // at park scale, not survey data — to stay under the 1MB ceiling.
  parks: {
    rest: "https://fcgis.frederickcountymd.gov/server_pub/rest/services/ParksAndRecreation/Parks/MapServer/0",
    keep: ["Name", "Address"],
    also: {
      rest: "https://fcgis.frederickcountymd.gov/server_pub/rest/services/ParksAndRecreation/Parks/MapServer/4",
      keep: ["Site_Name", "Park_Category"],
      nd: 4,
    },
  },
  markets: {
    rest: "https://fcgis.frederickcountymd.gov/server_pub/rest/services/Basemap/PointsOfInterest/MapServer/0",
    keep: ["Name", "Address", "Location"],
  },
  "county-boundary": {
    rest: "https://fcgis.frederickcountymd.gov/server_pub/rest/services/Basemap/CountyBoundary/MapServer/1",
    keep: [],
  },
};

function roundCoords(x, nd = 5) {
  if (Array.isArray(x)) return x.map((v) => roundCoords(v, nd));
  return typeof x === "number" ? Number(x.toFixed(nd)) : x;
}

// Drop consecutive duplicate vertices that coordinate rounding creates,
// and re-close the ring. Keeps polygon files small without changing
// their shape at render scale.
function dedupeRing(ring) {
  const out = [];
  for (const pt of ring) {
    const last = out[out.length - 1];
    if (!last || last[0] !== pt[0] || last[1] !== pt[1]) out.push(pt);
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0]);
  return out;
}

async function pullLayer(rest, keep, nd = 5) {
  const url = `${rest.replace(/\/$/, "")}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson`;
  const res = await fetch(url, { headers: { "User-Agent": "FrederickRadius/overlays" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const gj = await res.json();
  return (gj.features ?? []).flatMap((f) => {
    const props = f.properties ?? {};
    const slim = {};
    for (const k of keep) {
      const v = props[k];
      if (v != null && String(v).trim() !== "") {
        slim[k === "Name" || k === "Site_Name" ? "name" : k === "Park_Category" ? "Location" : k] = v;
      }
    }
    let coords = roundCoords(f.geometry.coordinates, nd);
    if (f.geometry.type === "Polygon") {
      coords = coords.map(dedupeRing).filter((r) => r.length >= 4);
      if (coords.length === 0) return [];
    } else if (f.geometry.type === "MultiPolygon") {
      coords = coords.map((poly) => poly.map(dedupeRing).filter((r) => r.length >= 4)).filter((poly) => poly.length > 0);
      if (coords.length === 0) return [];
    }
    return [{ type: "Feature", properties: slim, geometry: { type: f.geometry.type, coordinates: coords } }];
  });
}

for (const [key, def] of Object.entries(LAYERS)) {
  let features;
  try {
    // Polygons first (drawn under), then points (drawn over, tappable).
    const extra = def.also ? await pullLayer(def.also.rest, def.also.keep, def.also.nd ?? 5) : [];
    const main = await pullLayer(def.rest, def.keep);
    features = [...extra, ...main];
  } catch (e) {
    console.error(`  ${key}: ${e.message}, skipped`);
    continue;
  }
  const out = JSON.stringify({ type: "FeatureCollection", features });
  const dest = path.join(process.cwd(), "public", "overlays", `${key}.geojson`);
  writeFileSync(dest, out + "\n");
  console.log(`  ${key}: ${features.length} features, ${Math.round(out.length / 1024)}KB (${Math.round(gzipSync(out).length / 1024)}KB gzip) -> ${dest}`);
}
