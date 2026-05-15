"use client";

import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { PlaceCardData } from "@/lib/loaders/places";
import OpenClosedDot from "./OpenClosedDot";
import { formatDistance } from "@/lib/geo";
import SaveButton from "@/components/saved/SaveButton";
import { getLandmarkPhoto, wikimediaUrl } from "@/lib/integrations/wikimedia";
import PlacePhoto from "./PlacePhoto";
import { usePlaceSheet } from "./PlaceSheetProvider";
import { haptic } from "@/lib/haptics";

const GLYPH_BY_CATEGORY: Record<string, string> = {
  coffee: "☕", restaurant: "🍽", brewery: "🍺", bar: "🍸", bakery: "🥐",
  pizza: "🍕", park: "🌳", trail: "⛰", playground: "🛝", museum: "🏛",
  gallery: "🎨", theater: "🎭", music: "🎵", library: "📚", market: "🛒",
  antiques: "🪑", "book-store": "📖", yoga: "🧘", lodging: "🏨", parking: "🅿️",
  pharmacy: "💊", hardware: "🔧", government: "🏛", "public-safety": "🚓",
  voting: "🗳", transit: "🚆", arts: "🎭", outdoors: "🌲", family: "👨‍👩‍👧",
  shopping: "🛍", wellness: "💆", civic: "🏛", services: "🛠", food: "🍽",
};

function glyphFor(slug: string): string {
  return GLYPH_BY_CATEGORY[slug] ?? "📍";
}

export default function PlaceCard({
  place,
  compact = false,
  variant = "row",
}: {
  place: PlaceCardData;
  compact?: boolean;
  variant?: "row" | "feature";
}) {
  const cat = CATEGORY_BY_SLUG[place.category];
  const color = cat?.color ?? "#1A1A1A";
  const glyph = glyphFor(place.category);
  const photo = getLandmarkPhoto(place.slug);
  // Priority: Google Places photo (real, current) → seed hero_image → Wikimedia
  const photoUrl = place.google_photo_url ?? place.hero_image ?? (photo ? wikimediaUrl(photo.file, 800) : null);
  const { openSheet } = usePlaceSheet();
  const openDetail = () => { haptic("light"); openSheet(place); };

  if (variant === "feature" && photoUrl) {
    return (
      <article
        className="hover-lift group relative overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)]"
        style={{ borderColor: "var(--app-border)" }}
      >
        <button
          type="button"
          onClick={openDetail}
          aria-label={`View ${place.name} details`}
          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        >
          <div className="relative h-40 w-full overflow-hidden bg-[var(--app-bg-sunken)]">
            <PlacePhoto
              src={photoUrl}
              alt={photo?.alt ?? place.name}
              glyph={glyph}
              color={color}
              sizes="(min-width: 640px) 50vw, 100vw"
              className="transition-transform duration-500 group-hover:scale-105"
              rounded="0"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
              <div className="flex items-baseline gap-2">
                <h3 className="truncate font-serif text-lg font-semibold tracking-tight">
                  {place.name}
                </h3>
                {place.distance_m !== undefined && (
                  <span className="ml-auto whitespace-nowrap text-xs tabular-nums opacity-90">
                    {formatDistance(place.distance_m)}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs opacity-90">
                {cat?.name ?? place.category} · {place.short_blurb}
              </p>
            </div>
            <div className="absolute right-2 top-2 rounded-full bg-white/85 px-1.5 py-0.5 backdrop-blur">
              <OpenClosedDot status={place.open_status} />
            </div>
          </div>
        </button>
      </article>
    );
  }

  return (
    <article
      className="hover-lift group relative flex items-stretch gap-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3 shadow-[var(--app-shadow-1)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      {photoUrl ? (
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)]">
          <PlacePhoto
            src={photoUrl}
            alt={photo?.alt ?? place.name}
            glyph={glyph}
            color={color}
            sizes="56px"
          />
        </div>
      ) : (
        <div
          aria-hidden
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--app-radius-md)]"
          style={{ background: `${color}18`, color }}
        >
          <span className="text-[26px] leading-none">{glyph}</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <button
            type="button"
            onClick={openDetail}
            aria-label={`View ${place.name} details`}
            className="truncate text-left text-[15px] font-semibold tracking-tight outline-none focus-visible:underline"
            style={{ color: "var(--app-ink)" }}
          >
            <span className="absolute inset-0" aria-hidden />
            {place.name}
          </button>
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
