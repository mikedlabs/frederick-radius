/**
 * Build src/data/amenities.json from the vendored OSM amenity layers
 * (src/data/osm-amenities/*.geojson, ODbL — © OpenStreetMap
 * contributors). Static, keyless civic-utility points the app had
 * none of: restrooms, EV charging, Wi-Fi, bike parking, picnic,
 * playgrounds. Re-runnable: `npm run build:amenities` after a fresh
 * OSM pull. Normalizes to one typed Amenity, county-bbox guarded,
 * deduped, municipality-resolved. Pure transform, nothing fetched.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolveMunicipality } from "@/lib/connect";

const DIR = new URL("../src/data/osm-amenities/", import.meta.url).pathname;
const OUT = new URL("../src/data/amenities.json", import.meta.url).pathname;
// Frederick County bbox [south, west, north, east].
const BBOX: [number, number, number, number] = [39.265, -77.7, 39.745, -77.15];

type AmenityKind =
  | "restroom" | "ev_charging" | "wifi" | "bike_parking" | "picnic" | "playground";
type Amenity = {
  id: string;
  kind: AmenityKind;
  name: string;
  detail?: string;
  municipality: string;
  lng: number;
  lat: number;
};
type Props = Record<string, string | undefined>;

const FILES: Record<AmenityKind, string> = {
  restroom: "public_restrooms.geojson",
  ev_charging: "ev_charging.geojson",
  wifi: "wifi_hotspots.geojson",
  bike_parking: "bike_parking.geojson",
  picnic: "picnic_sites.geojson",
  playground: "playgrounds.geojson",
};
const KIND_LABEL: Record<AmenityKind, string> = {
  restroom: "Public restroom",
  ev_charging: "EV charging",
  wifi: "Free Wi-Fi",
  bike_parking: "Bike parking",
  picnic: "Picnic area",
  playground: "Playground",
};

function centroid(geom: { type?: string; coordinates?: unknown } | undefined): [number, number] | null {
  let c: unknown = geom?.coordinates;
  for (let d = 0; d < 6; d++) {
    if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number")
      return [c[0], c[1]];
    if (Array.isArray(c) && Array.isArray(c[0]) && Array.isArray((c[0] as unknown[])[0]) &&
        typeof ((c[0] as unknown[])[0] as unknown[])[0] === "number") {
      // ring of [lng,lat] pairs — average it
      const ring = c[0] as Array<[number, number]>;
      let sx = 0, sy = 0, k = 0;
      for (const v of ring) if (typeof v[0] === "number" && typeof v[1] === "number") { sx += v[0]; sy += v[1]; k++; }
      return k ? [sx / k, sy / k] : null;
    }
    if (Array.isArray(c) && c.length) { c = c[0]; continue; }
    return null;
  }
  return null;
}

function detailFor(kind: AmenityKind, p: Props): string | undefined {
  const yes = (v?: string) => v === "yes";
  const parts: string[] = [];
  if (kind === "restroom") {
    if (p.fee === "no") parts.push("Free");
    else if (p.fee === "yes") parts.push("Fee");
    if (yes(p.wheelchair)) parts.push("Accessible");
    if (yes(p.drinking_water)) parts.push("Water");
  } else if (kind === "ev_charging") {
    if (p.operator || p.brand) parts.push((p.operator || p.brand) as string);
    if (p.capacity) parts.push(`${p.capacity} ports`);
    if (p.fee === "no") parts.push("Free");
    else if (p.fee === "yes") parts.push("Paid");
  } else if (kind === "wifi") {
    parts.push(p["internet_access:fee"] === "customers" ? "Customers" : "Open");
  } else if (kind === "bike_parking") {
    if (yes(p.covered)) parts.push("Covered");
    if (p.capacity) parts.push(`${p.capacity} spaces`);
  } else if (kind === "picnic") {
    if (yes(p.covered)) parts.push("Covered");
  } else if (kind === "playground") {
    if (p.surface) parts.push(p.surface);
    if (yes(p.wheelchair)) parts.push("Accessible");
  }
  return parts.length ? parts.join(" · ") : undefined;
}

const [s, w, n, e] = BBOX;
const out: Amenity[] = [];
const seen = new Set<string>();
const counts: Record<string, number> = {};

for (const kind of Object.keys(FILES) as AmenityKind[]) {
  let fc: { features?: Array<{ geometry?: { type?: string; coordinates?: unknown }; properties?: Props }> };
  try {
    fc = JSON.parse(readFileSync(DIR + FILES[kind], "utf8"));
  } catch {
    continue;
  }
  for (const f of fc.features ?? []) {
    const p = f.properties ?? {};
    const pt = centroid(f.geometry);
    if (!pt) continue;
    const [lng, lat] = pt;
    if (lat < s || lat > n || lng < w || lng > e) continue;
    const id = `${kind}-${p._osm_type ?? "n"}-${p._osm_id ?? `${lng.toFixed(6)},${lat.toFixed(6)}`}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      kind,
      name: p.name?.trim() || KIND_LABEL[kind],
      detail: detailFor(kind, p),
      municipality: resolveMunicipality({ lng, lat }).municipality.slug,
      lng,
      lat,
    });
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
}

out.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${OUT} — ${out.length} amenities`);
console.log(JSON.stringify(counts, null, 0));
