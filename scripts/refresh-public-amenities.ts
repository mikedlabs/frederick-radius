/**
 * Refresh the small public-utility layer Radius needs even when Overpass is
 * slow at request time. The output is a vendored GeoJSON snapshot consumed by
 * build-amenities.ts. Source: OpenStreetMap via Overpass (ODbL).
 *
 * Deliberately conservative:
 * - drinking water requires amenity=drinking_water/water_point or the explicit
 *   drinking_water=yes tag; ornamental fountains are never treated as potable
 * - private/no-access points are excluded
 * - dog-waste bins tagged as waste_basket + waste=dog_excrement are preserved
 * - AEDs are not imported here because availability/access needs stronger
 *   verification than a map tag alone
 */
import { writeFileSync } from "node:fs";
import { FREDERICK_GUIDE_BBOX, isInFrederickCountyArea } from "@/lib/geo";

const OUT = new URL("../src/data/osm-amenities/public_utilities.geojson", import.meta.url).pathname;
// Collection envelope includes all of incorporated Mount Airy; the precise
// county/town-area check below rejects every unrelated point in the rectangle.
const BBOX: [number, number, number, number] = [
  FREDERICK_GUIDE_BBOX.south,
  FREDERICK_GUIDE_BBOX.west,
  FREDERICK_GUIDE_BBOX.north,
  FREDERICK_GUIDE_BBOX.east,
];
const [s, w, n, e] = BBOX;

type Element = {
  id: number;
  type: "node" | "way" | "relation";
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const QUERY = `
[out:json][timeout:120];
(
  nwr["amenity"~"^(drinking_water|water_point|waste_basket|recycling|dog_waste_bin|bench|bicycle_repair_station)$"](${s},${w},${n},${e});
  nwr["drinking_water"="yes"](${s},${w},${n},${e});
);
out center tags;
`.replace(/\n\s*/g, " ");

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

async function fetchElements(): Promise<Element[]> {
  const body = `data=${encodeURIComponent(QUERY)}`;
  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": "frederick-radius/1.0",
        },
        body,
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) {
        console.error(`  ${endpoint} -> ${response.status}`);
        continue;
      }
      const data = await response.json() as { elements?: Element[] };
      console.error(`  OK from ${endpoint}`);
      return data.elements ?? [];
    } catch (error) {
      console.error(`  ${endpoint} -> ${(error as Error).message}`);
    }
  }
  throw new Error("All Overpass endpoints failed");
}

async function main() {
const elements = await fetchElements();
const seen = new Set<string>();
const features: Array<{
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, string>;
}> = [];

for (const element of elements) {
  const lat = element.type === "node" ? element.lat : element.center?.lat;
  const lng = element.type === "node" ? element.lon : element.center?.lon;
  if (typeof lat !== "number" || typeof lng !== "number") continue;
  if (!isInFrederickCountyArea(lng, lat)) continue;
  const tags = element.tags ?? {};
  if (tags.access === "private" || tags.access === "no") continue;
  const waterTagged = tags.amenity === "drinking_water" || tags.amenity === "water_point" || tags.drinking_water === "yes";
  // A spring's safety can change after rain, and a large campsite polygon's
  // centroid is not an exact tap. Keep the static answer layer to fixtures or
  // facility points a visitor can navigate to without treating a broad area
  // or natural source as a verified fountain.
  if (waterTagged && (tags.natural === "spring" || tags.access === "customers")) continue;
  if (tags.drinking_water === "yes" && element.type !== "node" && tags.amenity !== "toilets") continue;
  const key = `${element.type}/${element.id}`;
  if (seen.has(key)) continue;
  seen.add(key);
  features.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: {
      ...tags,
      _osm_type: element.type[0],
      _osm_id: String(element.id),
    },
  });
}

features.sort((a, b) =>
  a.properties._osm_type.localeCompare(b.properties._osm_type) ||
  Number(a.properties._osm_id) - Number(b.properties._osm_id),
);

writeFileSync(OUT, JSON.stringify({
  type: "FeatureCollection",
  name: "public_utilities",
  features,
}));

const counts: Record<string, number> = {};
for (const feature of features) {
  const tags = feature.properties;
  const kind = tags.amenity === "waste_basket" && tags.waste === "dog_excrement"
    ? "dog_waste"
    : tags.amenity ?? "drinking_water=yes";
  counts[kind] = (counts[kind] ?? 0) + 1;
}
console.log(`wrote ${OUT} — ${features.length} public utility points`);
console.log(JSON.stringify(counts));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
