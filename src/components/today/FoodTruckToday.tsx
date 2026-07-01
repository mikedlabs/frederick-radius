import Link from "next/link";
import { Truck, ChevronRight } from "lucide-react";
import { FOOD_TRUCKS } from "@/data/food-trucks";
import { CATEGORY_BY_SLUG } from "@/data/categories";

/**
 * FoodTruckToday — a calm discovery door to the food-truck roster.
 *
 * Deliberately NOT a live claim: until trucks opt into beacons we can't say
 * who's out right now, so this is a "here's the county's trucks, check their
 * feeds" entry, not a "3 trucks open now" headline. When the beacon layer
 * lands, this card upgrades to a live "on now" count.
 */
export default function FoodTruckToday() {
  const accent = CATEGORY_BY_SLUG["food-truck"]?.color ?? "var(--app-brand)";
  const count = FOOD_TRUCKS.length;

  return (
    <Link
      href="/food-trucks"
      className="tactile tactile-interactive group flex items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3.5"
      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
    >
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
        style={{ background: `color-mix(in srgb, ${accent} 15%, var(--app-bg-elevated))`, color: accent }}
      >
        <Truck className="h-5 w-5" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-[16px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          Food trucks & carts
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          {count} local trucks and carts. See who&rsquo;s rolling and where to find them.
        </span>
      </span>
      <ChevronRight
        aria-hidden
        className="h-4 w-4 shrink-0 opacity-45 transition-transform group-hover:translate-x-0.5"
        strokeWidth={2}
        style={{ color: "var(--app-ink-3)" }}
      />
    </Link>
  );
}
