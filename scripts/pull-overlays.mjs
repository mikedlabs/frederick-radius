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
  parks: {
    rest: "https://fcgis.frederickcountymd.gov/server_pub/rest/services/ParksAndRecreation/Parks/MapServer/0",
    keep: ["Name", "Address"],
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

for (const [key, def] of Object.entries(LAYERS)) {
  const url = `${def.rest.replace(/\/$/, "")}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson`;
  const res = await fetch(url, { headers: { "User-Agent": "FrederickRadius/overlays" } });
  if (!res.ok) {
    console.error(`  ${key}: HTTP ${res.status}, skipped`);
    continue;
  }
  const gj = await res.json();
  const features = (gj.features ?? []).map((f) => {
    const props = f.properties ?? {};
    const slim = {};
    for (const k of def.keep) {
      const v = props[k];
      if (v != null && String(v).trim() !== "") slim[k === "Name" ? "name" : k] = v;
    }
    return { type: "Feature", properties: slim, geometry: { ...f.geometry, coordinates: roundCoords(f.geometry.coordinates) } };
  });
  const out = JSON.stringify({ type: "FeatureCollection", features });
  const dest = path.join(process.cwd(), "public", "overlays", `${key}.geojson`);
  writeFileSync(dest, out + "\n");
  console.log(`  ${key}: ${features.length} features, ${Math.round(out.length / 1024)}KB (${Math.round(gzipSync(out).length / 1024)}KB gzip) -> ${dest}`);
}
