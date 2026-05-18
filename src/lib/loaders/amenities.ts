import AMENITIES_RAW from "@/data/amenities.json" with { type: "json" };

/**
 * Civic amenities — static, keyless points from OpenStreetMap (ODbL,
 * © OpenStreetMap contributors), normalized by scripts/build-
 * amenities.ts. The "where's the nearest restroom / charger / Wi-Fi /
 * bike rack / picnic spot / playground" utility the app had none of.
 * Pure data accessor; refresh via `npm run build:amenities`.
 */
export type AmenityKind =
  | "restroom" | "ev_charging" | "wifi" | "bike_parking" | "picnic" | "playground";

export type Amenity = {
  id: string;
  kind: AmenityKind;
  name: string;
  detail?: string;
  municipality: string;
  lng: number;
  lat: number;
};

const AMENITIES = AMENITIES_RAW as Amenity[];

// Display order — most-asked-for first.
export const AMENITY_KINDS: { kind: AmenityKind; label: string; blurb: string }[] = [
  { kind: "restroom", label: "Public restrooms", blurb: "Where to go, downtown and in parks" },
  { kind: "wifi", label: "Free Wi-Fi", blurb: "Cafes and libraries with public internet" },
  { kind: "ev_charging", label: "EV charging", blurb: "Charging stations county-wide" },
  { kind: "bike_parking", label: "Bike parking", blurb: "Racks and covered bike parking" },
  { kind: "picnic", label: "Picnic spots", blurb: "Tables and picnic sites" },
  { kind: "playground", label: "Playgrounds", blurb: "County-wide, for the kids" },
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
