import Link from "next/link";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { PlaceCardData } from "@/lib/loaders/places";
import OpenClosedDot from "./OpenClosedDot";
import { formatDistance } from "@/lib/geo";
import SaveButton from "@/components/saved/SaveButton";

export default function PlaceCard({
  place,
  compact = false,
}: {
  place: PlaceCardData;
  compact?: boolean;
}) {
  const cat = CATEGORY_BY_SLUG[place.category];
  return (
    <article
      className="group relative flex items-stretch gap-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3 shadow-[var(--app-shadow-1)] transition hover:shadow-[var(--app-shadow-2)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div
        aria-hidden
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--app-radius-md)]"
        style={{ background: `${cat?.color ?? "#1A1A1A"}18`, color: cat?.color ?? "var(--app-ink)" }}
      >
        <CategoryGlyph slug={place.category} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <Link
            href={`/places/${place.slug}`}
            className="truncate text-[15px] font-semibold tracking-tight outline-none focus-visible:underline"
            style={{ color: "var(--app-ink)" }}
          >
            <span className="absolute inset-0" aria-hidden />
            {place.name}
          </Link>
          {place.distance_m !== undefined && (
            <span className="ml-auto whitespace-nowrap text-xs tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              {formatDistance(place.distance_m)}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs" style={{ color: "var(--app-ink-3)" }}>
          {cat?.name ?? place.category} · {place.short_blurb}
        </p>
        {!compact && (
          <div className="mt-2 flex items-center gap-2">
            <OpenClosedDot status={place.open_status} />
            {place.price_band && (
              <span className="text-xs font-medium" style={{ color: "var(--app-ink-3)" }}>
                {"$".repeat(place.price_band)}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="relative z-10 self-start">
        <SaveButton refType="place" refId={place.slug} label={`Save ${place.name}`} />
      </div>
    </article>
  );
}

function CategoryGlyph({ slug }: { slug: string }) {
  const map: Record<string, string> = {
    coffee: "☕", restaurant: "🍽", brewery: "🍺", bar: "🍸", bakery: "🥐",
    pizza: "🍕", park: "🌳", trail: "⛰", playground: "🛝", museum: "🏛",
    gallery: "🎨", theater: "🎭", music: "🎵", library: "📚", market: "🛒",
    antiques: "🪑", "book-store": "📖", yoga: "🧘", lodging: "🏨", parking: "🅿️",
    pharmacy: "💊", hardware: "🔧", government: "🏛", "public-safety": "🚓",
    voting: "🗳", transit: "🚆", arts: "🎭", outdoors: "🌲", family: "👨‍👩‍👧",
    shopping: "🛍", wellness: "💆", civic: "🏛", services: "🛠", food: "🍽",
  };
  return <span className="text-[26px] leading-none">{map[slug] ?? "📍"}</span>;
}
