import { placeCardPhotoPlan, type PlaceCardPhotoPlan } from "@/lib/place-card-photo";

/** Exact bundled registry candidates only. Eligibility is not decoded pixels.
 * Slug-only input cannot activate inline/provider metadata or arbitrary URLs. */
export function nearbyParksPhotoPlan(slug: string, width = 360): PlaceCardPhotoPlan {
  const registry = placeCardPhotoPlan({ slug }, width);
  const sources = registry.sources.filter(source => source.kind !== "google"
    && (source.src.startsWith("/images/") || source.src.startsWith("/place-photos/"))
    && !source.src.includes("?") && !source.src.includes("#"));
  return { key: `parks-local:${registry.key}`, sources };
}

export type NearbyParksRow<T> = { places: T[]; photoEligible: boolean };

/** Pair adjacent eligible pictures without changing any result's position.
 * Singles/no-photo records remain useful full-width rows, avoiding half-row
 * gaps. The CSS falls back to one column if a paired image actually fails. */
export function nearbyParksRows<T extends { slug: string }>(places: readonly T[]): NearbyParksRow<T>[] {
  const rows: NearbyParksRow<T>[] = [];
  for (const place of places) {
    const photoEligible = nearbyParksPhotoPlan(place.slug).sources.length > 0;
    const previous = rows.at(-1);
    if (photoEligible && previous?.photoEligible && previous.places.length === 1) previous.places.push(place);
    else rows.push({ places: [place], photoEligible });
  }
  return rows;
}
