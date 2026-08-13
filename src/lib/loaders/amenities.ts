import AMENITIES_RAW from "@/data/amenities.json" with { type: "json" };
import { isPlaygroundPlace } from "@/data/cravings";
import { haversineMeters, type LngLat } from "@/lib/geo";

/**
 * Civic amenities — static, keyless points from OpenStreetMap (ODbL,
 * © OpenStreetMap contributors), normalized by scripts/build-
 * amenities.ts. The "where's the nearest restroom / charger / Wi-Fi /
 * bike rack / picnic spot / playground" utility the app had none of.
 * Pure data accessor; refresh via `npm run build:amenities`.
 */
export type AmenityKind =
  | "restroom" | "ev_charging" | "wifi" | "bike_parking" | "picnic" | "playground"
  | "pool"
  | "river_gauge"
  | "dog_park"
  | "water_access"
  // Field-collected kinds (the /collect walkabout tool). These ride the
  // same Amenity shape + map layer as the static OSM amenities; the
  // points come from the field_amenities table, not amenities.json.
  | "trash" | "recycling" | "water" | "bench"
  | "dog_waste" | "dog_water" | "outlet" | "bike_repair" | "other";

export type Amenity = {
  id: string;
  kind: AmenityKind;
  name: string;
  detail?: string;
  municipality: string;
  lng: number;
  lat: number;
  /** Reference photo URL (field-collected points only; the /collect tool
   *  uploads it to blob storage). Undefined for static/OSM amenities. */
  photo?: string;
  /** Observation time for first-party field records and live infrastructure
   * readings. Static map points intentionally omit it. */
  observedAt?: string;
};

const AMENITIES = AMENITIES_RAW as Amenity[];

// Display order — most-asked-for first.
export const AMENITY_KINDS: { kind: AmenityKind; label: string; blurb: string }[] = [
  { kind: "restroom", label: "Public restrooms", blurb: "Find public restrooms downtown and in parks." },
  { kind: "wifi", label: "Free Wi-Fi", blurb: "Find public internet at cafes and libraries." },
  { kind: "ev_charging", label: "EV charging", blurb: "Find EV charging stations across the county." },
  { kind: "bike_parking", label: "Bike parking", blurb: "Find racks and covered bike parking." },
  { kind: "picnic", label: "Picnic spots", blurb: "Find tables and designated picnic sites." },
  { kind: "playground", label: "Playgrounds", blurb: "Find playgrounds across Frederick County." },
  { kind: "water", label: "Drinking water", blurb: "Find points tagged as potable water or bottle-fill stations." },
  { kind: "trash", label: "Trash cans", blurb: "Find public waste baskets mapped along streets and in parks." },
  { kind: "recycling", label: "Recycling", blurb: "Find public recycling drop-offs and collection containers." },
  { kind: "bench", label: "Benches", blurb: "Find benches along streets and trails, and in parks." },
  { kind: "dog_waste", label: "Dog-waste stations", blurb: "Find dog-bag dispensers and waste bins." },
  { kind: "dog_park", label: "Dog parks", blurb: "Find County-mapped public dog parks." },
  { kind: "water_access", label: "Water access", blurb: "Find County-mapped boat ramps and paddle launches." },
  { kind: "bike_repair", label: "Bike repair", blurb: "Find public fix-it stations and pumps." },
  // Pools — scaffolding for public swimming pools (city, county
  // recreation, Y branches). The kind is registered so the map's
  // amenity layer + filter UI can carry it; the actual point data
  // is empty until verified addresses + coords are collected. Once
  // entries land in amenities.json (kind="pool"), the layer
  // surfaces automatically via amenitiesByKind's "only kinds that
  // actually have points" filter — no UI change needed.
  { kind: "pool", label: "Public pools", blurb: "Find city, county, and YMCA pools. Check seasonal hours." },
  // River gauges — USGS sites on the Monocacy, Catoctin, Linganore,
  // Potomac. Data lives in usgsWater.ts; the map page hydrates these
  // into Amenity shape at request time so they ride the same layer
  // toggle system as restrooms / EV / playgrounds. Tap a gauge to
  // jump to /rivers for the live reading + 24-hour trend.
  { kind: "river_gauge", label: "River gauges", blurb: "See live USGS gauges on the Monocacy, Catoctin, Potomac, and Linganore waterways." },
];

export const AMENITY_COUNT = AMENITIES.length;

export function allAmenities(): Amenity[] {
  return AMENITIES;
}

/** Grouped in display order; only kinds that actually have points. */
export function amenitiesByKind(): { kind: AmenityKind; label: string; blurb: string; list: Amenity[] }[] {
  return AMENITY_KINDS.map((k) => ({
    ...k,
    list: AMENITIES.filter((a) => a.kind === k.kind).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  })).filter((g) => g.list.length > 0);
}

/** Slim place projection the amenity de-dupe needs (no loader import). */
export type AmenityPlacePoint = {
  name: string;
  category: string;
  geom: LngLat;
  subcategories?: string[];
  primary_type?: string;
  short_blurb?: string;
};

// Place categories that imply a picnic destination. A playground point has a
// stricter rule below: generic "park" is not proof that a playground exists.
// Utility amenities (restroom, Wi-Fi, EV, bike) are never dropped near a park.
const GREENSPACE = new Set([
  "park", "trail", "playground", "outdoors", "recreation", "nature",
]);

// A blanket 45m collapse erased legitimate street furniture: two benches or
// trash cans on the same block are two assets, not duplicate records. Broad
// area-like amenities can tolerate a wider merge; exact field assets cannot.
const CLUSTER_M_BY_KIND: Partial<Record<AmenityKind, number>> = {
  picnic: 45,
  playground: 35,
  wifi: 25,
  ev_charging: 20,
  restroom: 18,
  pool: 18,
  river_gauge: 12,
  dog_park: 25,
  water_access: 18,
  trash: 8,
  recycling: 8,
  water: 8,
  bench: 8,
  dog_waste: 8,
  dog_water: 8,
  outlet: 8,
  bike_parking: 8,
  bike_repair: 8,
  other: 8,
};
const DEFAULT_CLUSTER_M = 18;
const FIELD_TO_FIELD_CLUSTER_M = 2;
const PLACE_OVERLAP_M = 60; // an implied-kind point this close to its park

const cell = (lat: number, lng: number, sizeM: number) => {
  const k = 111_320 / sizeM;
  return `${Math.round(lat * k)},${Math.round(lng * k)}`;
};

/**
 * The amenity side of the ONE duplicate rule. Two deterministic,
 * conservative passes so a user never sees the same amenity twice:
 *
 *  1. Internal cluster collapse — repeated records of the SAME kind fold to
 *     one representative. The tolerance follows the asset: 45m for broad
 *     picnic areas, 8m for street furniture, and only 2m between two
 *     field-mapped points. This keeps two real bins or benches on a block.
 *  2. Place-overlap — a `picnic` point sitting on a canonical green-space
 *     place is dropped. A `playground` point is dropped only when the nearby
 *     place carries explicit playground evidence; a generic park must not
 *     erase the only mapped playground. Utility kinds remain distinct.
 *
 * Pure (places passed in), so the same result on server + tests.
 */
export function dedupeAmenities(
  list: Amenity[],
  places: AmenityPlacePoint[],
): Amenity[] {
  // Pass 1 — collapse same-kind clusters via a spatial union.
  const byKind = new Map<AmenityKind, Amenity[]>();
  for (const a of list) (byKind.get(a.kind) ?? byKind.set(a.kind, []).get(a.kind)!).push(a);
  const kept: Amenity[] = [];
  for (const group of byKind.values()) {
    const clusterM = CLUSTER_M_BY_KIND[group[0]?.kind] ?? DEFAULT_CLUSTER_M;
    const used = new Array(group.length).fill(false);
    const idx: Record<string, number[]> = {};
    group.forEach((a, i) =>
      (idx[cell(a.lat, a.lng, clusterM)] ??= []).push(i),
    );
    for (let i = 0; i < group.length; i++) {
      if (used[i]) continue;
      const cluster = [i];
      used[i] = true;
      const cy = Math.round((group[i].lat * 111_320) / clusterM);
      const cx = Math.round((group[i].lng * 111_320) / clusterM);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++)
          for (const j of idx[`${cy + dz},${cx + dx}`] ?? []) {
            if (used[j]) continue;
            const bothField = group[i].id.startsWith("field:") && group[j].id.startsWith("field:");
            const tolerance = bothField ? FIELD_TO_FIELD_CLUSTER_M : clusterM;
            if (
              group[i].id === group[j].id ||
              haversineMeters(
                { lng: group[i].lng, lat: group[i].lat },
                { lng: group[j].lng, lat: group[j].lat },
              ) <= tolerance
            ) {
              used[j] = true;
              cluster.push(j);
            }
          }
      // Representative = the most specifically named (longest name
      // wins over a bare "Picnic area"); stable by id otherwise.
      let best = group[cluster[0]];
      for (const c of cluster) {
        const cand = group[c];
        const candField = cand.id.startsWith("field:");
        const bestField = best.id.startsWith("field:");
        if (
          (candField && !bestField) ||
          (candField === bestField && cand.name.length > best.name.length) ||
          (candField === bestField && cand.name.length === best.name.length && cand.id < best.id)
        ) {
          best = cand;
        }
      }
      kept.push(best);
    }
  }

  // Pass 2 — drop place-implied kinds only when the place proves that kind.
  const parks = places.filter(
    (p) => GREENSPACE.has(p.category) || isPlaygroundPlace(p),
  );
  const pIdx: Record<string, AmenityPlacePoint[]> = {};
  for (const p of parks)
    (pIdx[cell(p.geom.lat, p.geom.lng, PLACE_OVERLAP_M)] ??= []).push(p);
  return kept.filter((a) => {
    if (a.kind !== "picnic" && a.kind !== "playground") return true;
    const cy = Math.round((a.lat * 111_320) / PLACE_OVERLAP_M);
    const cx = Math.round((a.lng * 111_320) / PLACE_OVERLAP_M);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++)
        for (const p of pIdx[`${cy + dz},${cx + dx}`] ?? [])
          if (
            (a.kind === "picnic"
              ? GREENSPACE.has(p.category)
              : isPlaygroundPlace(p)) &&
            haversineMeters({ lng: a.lng, lat: a.lat }, p.geom) <=
            PLACE_OVERLAP_M
          )
            return false;
    return true;
  });
}
