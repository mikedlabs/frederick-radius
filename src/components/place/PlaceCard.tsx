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
import PlaceStatus from "./PlaceStatus";
import { knownFor } from "@/lib/cuisine";
import { Star } from "lucide-react";
import CategoryIcon from "./CategoryIcon";
import CategoryGraphic from "@/components/ui/CategoryGraphic";
import SourceBadge from "./SourceBadge";
import { ReasonChipRow } from "@/components/ui/ReasonChip";
import { placeReasons } from "@/lib/place-reasons";

/**
 * "What people rave about" — only when there is a real Google rating
 * with enough reviews to mean something (≥20). Honest: most DFP rows
 * have no rating and simply show nothing, never a fabricated score.
 */
function Rave({
  rating,
  count,
  className = "",
}: {
  rating?: number;
  count?: number;
  className?: string;
}) {
  if (!rating || !count || count < 20) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[12px] font-semibold tabular-nums ${className}`}
      style={{ color: "var(--app-ink-2)" }}
      title={`${rating.toFixed(1)} from ${count.toLocaleString()} Google reviews`}
    >
      <Star className="h-3 w-3" strokeWidth={0} fill="var(--app-warning)" aria-hidden />
      {rating.toFixed(1)}
      <span className="font-normal" style={{ color: "var(--app-ink-3)" }}>
        ({count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count})
      </span>
    </span>
  );
}

const GLYPH_BY_CATEGORY: Record<string, string> = {
  coffee: "☕", restaurant: "🍽", brewery: "🍺", bar: "🍸", bakery: "🥐",
  pizza: "🍕", park: "🌳", trail: "⛰", playground: "🛝", museum: "🏛",
  gallery: "🎨", theater: "🎭", music: "🎵", library: "📚", market: "🛒",
  antiques: "🪑", "book-store": "📖", yoga: "🧘", lodging: "🏨", parking: "🅿️",
  pharmacy: "💊", hardware: "🔧", government: "🏛", "public-safety": "🚓",
  voting: "🗳", transit: "🚆", arts: "🎭", outdoors: "🌲", family: "👨‍👩‍👧",
  shopping: "🛍", wellness: "💆", civic: "🏛", services: "🛠", food: "🍽",
  worship: "⛪",
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
  variant?: "row" | "feature" | "tile" | "grid";
}) {
  const cat = CATEGORY_BY_SLUG[place.category];
  const color = cat?.color ?? "#1A1A1A";
  const glyph = glyphFor(place.category);
  const photo = getLandmarkPhoto(place.slug);
  // Priority: Google Places photo (real, current) → seed hero_image → Wikimedia
  const photoUrl = place.google_photo_url ?? place.hero_image ?? (photo ? wikimediaUrl(photo.file, 800) : null);
  const { openSheet } = usePlaceSheet();
  const openDetail = () => { haptic("light"); openSheet(place); };
  // "Known for" — the real descriptive blurb, or null for DFP filler.
  const kf = knownFor(place);

  if (variant === "feature" && photoUrl) {
    return (
      <article
        className="tactile tactile-interactive group relative overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)]"
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

  // Fixed-width, photo-forward tile for horizontal shelves. Crafted the
  // same whether or not a photo exists — most DFP places have none, so a
  // tonal category panel stands in so a shelf never looks broken.
  if (variant === "tile") {
    return (
      <article
        className="tactile tactile-interactive group relative w-[244px] shrink-0 overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)]"
      >
        <button
          type="button"
          onClick={openDetail}
          aria-label={`View ${place.name} details`}
          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        >
          <div className="relative h-40 w-full overflow-hidden bg-[var(--app-bg-sunken)]">
            {photoUrl ? (
              <>
                <PlacePhoto
                  src={photoUrl}
                  alt={photo?.alt ?? place.name}
                  glyph={glyph}
                  color={color}
                  sizes="244px"
                  className="transition-transform duration-[600ms] ease-out group-hover:scale-[1.06]"
                  rounded="0"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
              </>
            ) : (
              <CategoryGraphic
                category={place.category}
                seed={place.slug}
                className="absolute inset-0 transition-transform duration-[600ms] ease-out group-hover:scale-[1.04]"
              />
            )}
            {/* Category chip — top-left, always visible. Photo-backed
                tiles get a filled chip in the category color; the no-
                photo block gets a soft tinted chip. The "what is this"
                signal makes a coffee shop visibly different from a park
                tile at a glance, even when the photo is generic. */}
            {cat && (
              <span
                className="absolute left-2 top-2 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{
                  background: photoUrl ? color : `color-mix(in srgb, ${color} 22%, var(--app-bg-elevated))`,
                  color: photoUrl ? "white" : color,
                }}
              >
                {cat.name}
              </span>
            )}
            {/* Category color band along the bottom edge of the banner
                — the through-line that ties cards to their type. */}
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-[3px]"
              style={{ background: color }}
            />
          </div>
          <div className="space-y-1 p-3.5">
            <div className="flex items-baseline gap-2">
              <h3
                className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight"
                style={{ color: "var(--app-ink)" }}
              >
                {place.name}
              </h3>
              {/* SourceBadge — surfaces trust tier (Curated / Verified
                  / Community / Official) at the card level. Self-hides
                  when there's no honest claim, so most rows aren't
                  affected. Sits next to the name so the reader sees
                  *where the data came from* without scanning. */}
              <SourceBadge place={place} size="sm" />
            </div>
            <p
              className="truncate text-[12px]"
              style={{ color: "var(--app-ink-3)" }}
            >
              {cat?.name ?? place.category}
              {place.distance_m !== undefined && (
                <> · {formatDistance(place.distance_m)}</>
              )}
            </p>
            {/* Reason chips on the tile variant — same producer as the
                grid variant. Falls back to the legacy status+rating
                row only if placeReasons() returns empty. */}
            {(() => {
              const reasons = placeReasons(place);
              return reasons.length > 0 ? (
                <ReasonChipRow reasons={reasons} className="pt-0.5" />
              ) : (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <PlaceStatus status={place.open_status} className="!text-[12px]" />
                  <Rave
                    rating={place.google_rating}
                    count={place.google_rating_count}
                    className="!text-[12px]"
                  />
                </div>
              );
            })()}
          </div>
        </button>
        <div className="absolute right-2 top-2 z-10">
          <SaveButton refType="place" refId={place.slug} label={`Save ${place.name}`} />
        </div>
      </article>
    );
  }

  // Fluid compact card for a responsive grid — fills its cell, small
  // image, tight text. Roughly a third the footprint of `tile`, so a
  // 2-up grid shows ~6 places per fold instead of ~1.5.
  if (variant === "grid") {
    return (
      <article
        className="tactile tactile-interactive group relative overflow-hidden rounded-[var(--app-radius-md)] bg-[var(--app-bg-elevated)]"
      >
        <button
          type="button"
          onClick={openDetail}
          aria-label={`View ${place.name} details`}
          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        >
          <div className="relative h-[88px] w-full overflow-hidden bg-[var(--app-bg-sunken)]">
            {photoUrl ? (
              <>
                <PlacePhoto
                  src={photoUrl}
                  alt={photo?.alt ?? place.name}
                  glyph={glyph}
                  color={color}
                  sizes="50vw"
                  className="transition-transform duration-500 ease-out group-hover:scale-105"
                  rounded="0"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
              </>
            ) : (
              <div
                aria-hidden
                className="flex h-full w-full items-center justify-center"
                style={{
                  background: `radial-gradient(120% 120% at 30% 20%, ${color}2e, ${color}0a 70%)`,
                  color,
                }}
              >
                <CategoryIcon slug={place.category} strokeWidth={1.75} className="h-8 w-8 opacity-90" style={{ color }} />
              </div>
            )}
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-[2px]"
              style={{ background: color }}
            />
          </div>
          <div className="space-y-0.5 px-2.5 py-2">
            <h3
              className="truncate text-[13.5px] font-semibold tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              {place.name}
            </h3>
            <p
              className="truncate text-[11px]"
              style={{ color: "var(--app-ink-3)" }}
            >
              {cat?.name ?? place.category}
              {place.distance_m !== undefined && (
                <> · {formatDistance(place.distance_m)}</>
              )}
            </p>
            {/* Reason chips — "Open now · 4 min walk · Verified" —
                the decision context the brief asks for. Derived from
                fields the loader already produces, capped at 3 per
                card. Falls back to the old status/rating row if the
                chip producer returns nothing (e.g. a place with no
                open_status, no distance, and no recent verify). */}
            {(() => {
              const reasons = placeReasons(place);
              return reasons.length > 0 ? (
                <ReasonChipRow reasons={reasons} className="pt-0.5" />
              ) : (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <PlaceStatus status={place.open_status} className="!text-[11px]" />
                  <Rave
                    rating={place.google_rating}
                    count={place.google_rating_count}
                    className="!text-[11px]"
                  />
                </div>
              );
            })()}
          </div>
        </button>
      </article>
    );
  }

  return (
    <article
      className="tactile tactile-interactive group relative flex items-stretch gap-3.5 rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-3.5"
    >
      {photoUrl ? (
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)]">
          <PlacePhoto
            src={photoUrl}
            alt={photo?.alt ?? place.name}
            glyph={glyph}
            color={color}
            sizes="64px"
          />
        </div>
      ) : (
        <div
          aria-hidden
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--app-radius-md)]"
          style={{ background: `linear-gradient(145deg, ${color}26, ${color}0c)`, color }}
        >
          <CategoryIcon slug={place.category} strokeWidth={1.75} className="h-7 w-7 opacity-90" style={{ color }} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
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
          {/* SourceBadge — same trust tier surfacing as the detail
              page, set inline next to the name. Self-hides when
              there's nothing honest to claim. */}
          <SourceBadge place={place} size="sm" />
          {place.distance_m !== undefined && (
            <span className="ml-auto whitespace-nowrap text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              {formatDistance(place.distance_m)}
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          {cat?.name ?? place.category}
          {kf && <> · {kf}</>}
        </p>
        {!compact && (() => {
          // Reason chips on the row variant — same producer as grid +
          // tile. Falls back to the legacy status / rating / price row
          // only if placeReasons() returns nothing.
          const reasons = placeReasons(place);
          if (reasons.length > 0) {
            return <ReasonChipRow reasons={reasons} className="mt-2" />;
          }
          return (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <PlaceStatus status={place.open_status} />
              <Rave rating={place.google_rating} count={place.google_rating_count} />
              {place.price_band && (
                <span className="text-[12px] font-medium" style={{ color: "var(--app-ink-3)" }}>
                  {"$".repeat(place.price_band)}
                </span>
              )}
            </div>
          );
        })()}
      </div>
      <div className="relative z-10 self-start">
        <SaveButton refType="place" refId={place.slug} label={`Save ${place.name}`} />
      </div>
    </article>
  );
}
