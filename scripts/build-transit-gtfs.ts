/**
 * Build src/data/transit.json from the live TransIT Frederick GTFS feed.
 * Fetches the static GTFS zip, extracts routes, stops, and a
 * representative (longest) simplified shape per route — the network the
 * live-bus map / radius reachability draw on. Realtime is separate
 * (src/lib/integrations/transitRealtime.ts).
 *
 *   npm run build:transit
 *
 * Uses the `unzip` CLI (build-time only; available on Linux/CI/Vercel).
 */
import { writeFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";

const GTFS_URL = "https://passio3.com/frederick/passioTransit/gtfs/google_transit.zip";
const TMP = "/tmp/fr-gtfs";
const OUT = new URL("../src/data/transit.json", import.meta.url).pathname;
const OUT_ROUTES = new URL("../src/data/transit-routes.json", import.meta.url).pathname;

function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur); return out;
}
function csv(file: string): Record<string, string>[] {
  const lines = readFileSync(`${TMP}/${file}`, "utf8").split(/\r?\n/).filter(Boolean);
  const hdr = splitCsvLine(lines[0]);
  return lines.slice(1).map((l) => {
    const c = splitCsvLine(l); const o: Record<string, string> = {};
    hdr.forEach((h, i) => (o[h] = c[i])); return o;
  });
}

async function main() {
  mkdirSync(TMP, { recursive: true });
  const res = await fetch(GTFS_URL);
  if (!res.ok) { console.error(`  GTFS fetch failed (${res.status})`); process.exit(1); }
  writeFileSync(`${TMP}/gtfs.zip`, Buffer.from(await res.arrayBuffer()));
  execSync(`unzip -o ${TMP}/gtfs.zip -d ${TMP}`, { stdio: "ignore" });

  const routes = csv("routes.txt").map((r) => ({
    id: r.route_id, short: r.route_short_name, name: r.route_long_name,
    color: "#" + (r.route_color || "888888"), text: "#" + (r.route_text_color || "FFFFFF"),
  }));
  const stops = csv("stops.txt")
    .filter((s) => s.stop_lat && s.stop_lon && s.location_type !== "1")
    .map((s) => ({
      id: s.stop_id, name: s.stop_name,
      lat: +(+s.stop_lat).toFixed(5), lng: +(+s.stop_lon).toFixed(5),
      wc: s.wheelchair_boarding === "1" || undefined,
    }));

  // route → representative (longest) shape, simplified to ≤120 pts
  const shapeByRoute: Record<string, Set<string>> = {};
  for (const t of csv("trips.txt")) {
    if (!t.shape_id) continue;
    (shapeByRoute[t.route_id] ??= new Set()).add(t.shape_id);
  }
  const raw: Record<string, [number, number, number][]> = {};
  for (const p of csv("shapes.txt"))
    (raw[p.shape_id] ??= []).push([+p.shape_pt_sequence, +p.shape_pt_lat, +p.shape_pt_lon]);
  for (const k in raw) raw[k].sort((a, b) => a[0] - b[0]);
  const simplify = (pts: [number, number, number][]) => {
    const step = Math.max(1, Math.ceil(pts.length / 120));
    const out = pts.filter((_, i) => i % step === 0);
    if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
    return out.map((p) => [+p[1].toFixed(5), +p[2].toFixed(5)]);
  };
  const shapes: Record<string, number[][]> = {};
  for (const [rid, set] of Object.entries(shapeByRoute)) {
    let best: string | null = null;
    for (const sid of set) if (raw[sid] && (!best || raw[sid].length > raw[best].length)) best = sid;
    if (best) shapes[rid] = simplify(raw[best]);
  }

  const out = {
    agency: "Transit Services of Frederick County", fareFree: true, phone: "301-600-2065",
    generatedAt: new Date().toISOString().slice(0, 10), routes, stops, shapes,
  };
  writeFileSync(OUT, JSON.stringify(out));
  // Slim routes-only slice for the map's LiveBuses overlay: it needs only
  // the id->color/label lookup (~1.4KB), so shipping it the full 76KB file
  // (stops + shapes geometry) would bloat the /map and /my-radius client
  // bundles. The full transit.json stays for the /transit page (lazy).
  writeFileSync(OUT_ROUTES, JSON.stringify(routes));
  rmSync(TMP, { recursive: true, force: true });
  console.log(`  transit.json: ${routes.length} routes · ${stops.length} stops · ${Object.keys(shapes).length} shapes`);
}

main();
