/**
 * PlaceAmenityIcons — Waze-style horizontal amenity icon row.
 *
 * Replaces the text-pill amenity list with iconography. A reader's
 * eye lands on three rows of icons in milliseconds — far faster than
 * scanning "Outdoor seating · Dog friendly · Wheelchair accessible."
 * The detail page's busiest section becomes its quietest.
 *
 * Visual register
 *   Each amenity gets a 36px circle with a tinted bg in the brand
 *   family + a 18px stroke icon. Below each, a tiny 10px caption so
 *   the icon never has to do the work alone (mobile thumbs are bad
 *   at long-press for tooltips). The row wraps onto multiple lines
 *   on narrow viewports rather than scrolling — every amenity should
 *   be visible without panning.
 *
 * Coverage
 *   We map the curated amenity slugs from src/data/places-overrides.json
 *   and the seed data. Unknown slugs fall through to a neutral
 *   placeholder so a new amenity slug doesn't break the page; it just
 *   gets a quiet "(slug)" rendering until someone adds an icon mapping.
 */
import {
  Wifi,
  Trees,
  Dog,
  ParkingCircle,
  Bike,
  Sun,
  Music,
  ShoppingBag,
  Truck,
  CalendarClock,
  Wine,
  Accessibility,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import RestroomMark from "@/components/icons/RestroomMark";

type AmenityMeta = {
  /** Lucide icon component. */
  icon: LucideIcon;
  /** Short label for the caption under each icon. ≤12 chars to fit. */
  label: string;
};

// Slug → icon + caption. Sourced from the place data's `amenities`
// arrays and prettyAmenity()'s existing map. Keeping the slugs as
// the canonical key means a slug rename in the data file is the only
// place a change needs to land.
const AMENITY_META: Record<string, AmenityMeta> = {
  wifi: { icon: Wifi, label: "Wi-Fi" },
  "outdoor-seating": { icon: Trees, label: "Outdoor" },
  "dog-friendly": { icon: Dog, label: "Dogs OK" },
  "parking-lot": { icon: ParkingCircle, label: "Parking" },
  "bike-rack": { icon: Bike, label: "Bike" },
  restroom: { icon: RestroomMark, label: "Restroom" },
  patio: { icon: Sun, label: "Patio" },
  "live-music": { icon: Music, label: "Live music" },
  takeout: { icon: ShoppingBag, label: "Takeout" },
  delivery: { icon: Truck, label: "Delivery" },
  reservations: { icon: CalendarClock, label: "Reservations" },
  byob: { icon: Wine, label: "BYOB" },
  accessible: { icon: Accessibility, label: "Accessible" },
};

function metaFor(slug: string): AmenityMeta {
  return (
    AMENITY_META[slug] ?? {
      icon: CheckCircle2,
      // Best-effort caption from the slug itself; humanized.
      label: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    }
  );
}

export default function PlaceAmenityIcons({
  amenities,
  accent = "var(--app-brand)",
}: {
  /** Curated amenity slugs from the place record. Empty arrays should
   *  cause the parent to skip rendering this component — we still
   *  return null defensively. */
  amenities: readonly string[];
  /** Icon tint. Defaults to brand brick; pass a category color when
   *  the parent wants the row to match the place's category accent. */
  accent?: string;
}) {
  if (!amenities || amenities.length === 0) return null;
  return (
    <section aria-label="Amenities">
      <h2 className="eyebrow mb-2" style={{ color: "var(--app-ink-3)" }}>
        What you&rsquo;ll find
      </h2>
      <ul
        // grid-cols layout instead of a wrapped flex row keeps every
        // tile the same width — the labels under the icons align
        // cleanly across rows regardless of label length.
        className="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-6"
      >
        {amenities.map((slug) => {
          const m = metaFor(slug);
          const Icon = m.icon;
          return (
            <li
              key={slug}
              className="flex flex-col items-center gap-1"
            >
              <span
                aria-hidden
                className="grid h-9 w-9 place-items-center rounded-full"
                style={{
                  background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                  color: accent,
                }}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
              </span>
              <span
                className="text-center text-[11px] font-semibold leading-tight tracking-tight"
                style={{ color: "var(--app-ink-2)" }}
              >
                {m.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
