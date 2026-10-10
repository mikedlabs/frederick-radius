/**
 * TodaySeasonalPick — one collection that fits the season or day.
 *
 * Simple, clear rule: pick by season first, then weather condition.
 * - Rainy/wet day → "Rainy Day Frederick"
 * - Fall (Sept-Nov) → "Beer around Frederick"  
 * - Winter (Dec-Feb) → "Rainy Day Frederick" (indoor)
 * - Spring/Summer (Mar-Aug) → "Where to ride" or "Frederick without a plan"
 *
 * Shows: collection title, blurb, link to the full collection list.
 * Photo optional; default to none per spec.
 */

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { TodayListArrow } from "./TodayListLink";
import { COLLECTION_BY_SLUG, type CollectionDef } from "@/data/collections";
import { easternParts } from "@/lib/tz";
import { Surface } from "@/components/ui/Surface";

/** Pick a seasonal collection based on date and optional weather lean. */
export function pickSeasonalCollection(
  now: Date,
  weatherLean?: "wet" | "hot" | null,
): CollectionDef | null {
  // Rainy day takes priority
  if (weatherLean === "wet") {
    return COLLECTION_BY_SLUG["rainy-day-frederick"] ?? null;
  }

  // Seasonal picks
  const { month } = easternParts(now);
  
  // Winter: indoor picks (Dec-Feb)
  if (month >= 12 || month <= 2) {
    return COLLECTION_BY_SLUG["rainy-day-frederick"] ?? null;
  }
  
  // Fall: beer season (Sept-Nov)
  if (month >= 9 && month <= 11) {
    return COLLECTION_BY_SLUG["beer-around-frederick"] ?? null;
  }
  
  // Spring/Summer: outdoor picks (Mar-Aug)
  // Alternate between ride and walk
  const weekNum = Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
  if (weekNum % 2 === 0) {
    return COLLECTION_BY_SLUG["where-to-ride"] ?? null;
  } else {
    return COLLECTION_BY_SLUG["frederick-without-a-plan"] ?? null;
  }
}

export default function TodaySeasonalPick({
  collection,
}: {
  collection: CollectionDef;
}) {
  return (
    <section aria-label="Today's pick" className="mt-6">
      <Surface
        variant="raised"
        padding="none"
        className="relative overflow-hidden"
      >
      <Link
        href={`/collections/${collection.slug}`}
        className="tactile tactile-interactive group relative block p-4"
      >
        {/* Color accent strip */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-1"
          style={{ background: collection.accent }}
        />
        <div className="flex items-start gap-3 pl-2">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
            style={{
              background: `color-mix(in srgb, ${collection.accent} 14%, transparent)`,
            }}
          >
            <BookOpen
              className="h-4 w-4"
              strokeWidth={2}
              style={{ color: collection.accent }}
              aria-hidden
            />
          </span>
          <div className="min-w-0 flex-1">
            <h3
              className="font-sans text-[16px] font-semibold leading-snug tracking-tight transition-colors group-hover:underline"
              style={{ color: "var(--app-ink)" }}
            >
              {collection.title}
            </h3>
            <p
              className="mt-1 text-[13px] leading-snug"
              style={{ color: "var(--app-ink-2)" }}
            >
              {collection.blurb}
            </p>
            <div className="today-list-link mt-2 inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
              {collection.places.length} {collection.places.length === 1 ? "place" : "places"}
              <TodayListArrow />
            </div>
          </div>
        </div>
      </Link>
      </Surface>
    </section>
  );
}
