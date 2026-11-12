/**
 * PlaceAmenityIcons: the "What you'll find" list on a place page.
 *
 * A plain two-column checklist (one column on a 320px phone). Each line is a
 * small check glyph in the Forest text color, the terrain and positive cue,
 * followed by the amenity name in 15px ink, left-aligned. The labels carry
 * the meaning; the glyph only marks the line as something the place has.
 *
 * Coverage
 *   Curated amenity slugs from src/data/places-overrides.json and the seed
 *   data map to short labels. An unknown slug falls back to a humanized form
 *   of the slug itself, so a new amenity never breaks the page.
 */
import { Check } from "lucide-react";
import PlaceSectionLabel from "./PlaceSectionLabel";

// Slug to label. Keeping the slugs as the canonical key means a slug rename
// in the data file is the only place a change needs to land.
const AMENITY_LABEL: Record<string, string> = {
  wifi: "Wi-Fi",
  "outdoor-seating": "Outdoor",
  "dog-friendly": "Dogs OK",
  "parking-lot": "Parking",
  "bike-rack": "Bike",
  restroom: "Restroom",
  patio: "Patio",
  "live-music": "Live music",
  takeout: "Takeout",
  delivery: "Delivery",
  reservations: "Reservations",
  byob: "BYOB",
  accessible: "Accessible",
};

export function amenityLabel(slug: string): string {
  return (
    AMENITY_LABEL[slug] ??
    // Best-effort label from the slug itself; humanized.
    slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export default function PlaceAmenityIcons({
  amenities,
}: {
  /** Curated amenity slugs from the place record. Empty arrays should
   *  cause the parent to skip rendering this component; it still returns
   *  null defensively. */
  amenities: readonly string[];
}) {
  if (!amenities || amenities.length === 0) return null;
  return (
    <section aria-labelledby="place-amenities-heading" className="space-y-2">
      <PlaceSectionLabel id="place-amenities-heading">
        What you&rsquo;ll find
      </PlaceSectionLabel>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 max-[359px]:grid-cols-1">
        {amenities.map((slug) => (
          <li key={slug} className="flex min-w-0 items-start gap-2 text-[15px] leading-snug" style={{ color: "var(--app-ink)" }}>
            <Check
              aria-hidden
              className="mt-[3px] h-4 w-4 shrink-0"
              strokeWidth={2.25}
              style={{ color: "var(--app-forest-text)" }}
            />
            <span className="min-w-0">{amenityLabel(slug)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
