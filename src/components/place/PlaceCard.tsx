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
import { ReasonChipRow, type ReasonTone } from "@/components/ui/ReasonChip";
import { placeReasons, type PlaceReasonChip } from "@/lib/place-reasons";
import { BeenHereIndicator } from "./BeenHereIndicator";

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

/**
 * Tactile status chips for the result cards. Same tone vocabulary +
 * color tokens as ReasonChip, but dressed in the front-door tile's
 * "made" language: the tint is the fill, a 1px tinted inset edge
 * crisps it, and a hairline top highlight catches light so the chip
 * reads as a pressed token rather than flat colored text. Restyle
 * only — every chip here comes straight from placeReasons(), so no
 * badge is ever invented.
 */
const CHIP_TONE: Record<ReasonTone, { color: string; tint: string; edge: string }> = {
  open:     { color: "var(--app-positive)", tint: "var(--app-positive-tint-14)", edge: "color-mix(in srgb, var(--app-positive) 26%, transparent)" },
  near:     { color: "var(--app-cool)",     tint: "var(--app-cool-tint-14)",     edge: "color-mix(in srgb, var(--app-cool) 24%, transparent)" },
  verified: { color: "var(--app-brand-2)",  tint: "color-mix(in srgb, var(--app-brand-2) 14%, transparent)", edge: "color-mix(in srgb, var(--app-brand-2) 26%, transparent)" },
  free:     { color: "var(--app-positive)", tint: "var(--app-positive-tint-14)", edge: "color-mix(in srgb, var(--app-positive) 26%, transparent)" },
  rated:    { color: "var(--app-accent)",   tint: "color-mix(in srgb, var(--app-accent) 20%, transparent)",  edge: "color-mix(in srgb, var(--app-accent) 34%, transparent)" },
  neutral:  { color: "var(--app-ink-2)",    tint: "var(--app-ink-tint-6)",       edge: "var(--app-ink-tint-12)" },
};

function StatusChip({ label, tone = "neutral" }: { label: string; tone?: ReasonTone }) {
  const t = CHIP_TONE[tone];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-[3px] text-[11px] font-semibold leading-none tracking-tight"
      style={{
        color: t.color,
        background: t.tint,
        // Crisp tinted edge + a faint inner top highlight = the tile's
        // "this is a physical token" feel, not flat colored text.
        boxShadow: `inset 0 0 0 1px ${t.edge}, inset 0 1px 0 rgba(255,255,255,0.45)`,
      }}
    >
      {label}
    </span>
  );
}

function StatusChipRow({ reasons, className = "" }: { reasons: PlaceReasonChip[]; className?: string }) {
  if (reasons.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`} aria-label="Reasons this is shown">
      {reasons.map((r, i) => (
        <StatusChip key={`${r.label}-${i}`} label={r.label} tone={r.tone} />
      ))}
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
  galleryPhotos,
  showSource = true,
}: {
  place: PlaceCardData;
  compact?: boolean;
  variant?: "row" | "feature" | "tile" | "grid" | "answer";
  /** Show the source/trust badge. Off in dense lists where every row is the
   *  same baseline tier (the badge becomes repetitive "chip soup"); the full
   *  trust signal still lives on the detail sheet. */
  showSource?: boolean;
  /** Extra photos (proxied URLs) for the answer variant's food/photo
   *  strip. The funnel fetches these on demand from the enrich route
   *  for its lead pick; absent it, the strip simply doesn't render. */
  galleryPhotos?: string[];
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
                {cat?.name ?? place.category} · {place.known_for?.[0] ?? place.short_blurb}
                <BeenHereIndicator slug={place.slug} />
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

  // The "answer" card — the funnel's lead pick. Photo on top (or a
  // tonal category graphic when there's none), then a content block
  // that reveals every honest signal we hold for this place in one
  // glance: open status + closing time, the why-it-matches reason
  // chips, the Google rating, price band, and — the buried gem most
  // cards never surface — the attributed "what people say" snippet.
  // The full reveal (hours table, photos, map, reviews) is one tap
  // away in the PlaceSheet. Never fabricates: each line self-hides
  // when the data isn't there.
  if (variant === "answer") {
    const reasons = placeReasons(place);
    const loved = (place.customers_loved ?? []).slice(0, 3);
    // Food/photo strip — the extra Google photos (dishes, interior)
    // beyond the hero. The hero is filtered out so it never repeats.
    const stripPhotos = (galleryPhotos ?? []).filter((u) => u && u !== photoUrl).slice(0, 6);
    return (
      <article
        className="tactile tactile-e3 tactile-interactive group relative overflow-hidden rounded-[var(--app-radius-lg)]"
        style={{
          background: "var(--app-bg-elevated-solid)",
          // Paper catching light from the top-left — the brief's
          // "big surface" sheen layered over the solid fill.
          backgroundImage: "var(--app-paper-light)",
        }}
      >
        <button
          type="button"
          onClick={openDetail}
          aria-label={`View ${place.name} details`}
          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        >
          {/* Cinematic banner — taller than the tile so the lead pick
              reads as "the answer," not another row. */}
          <div className="relative h-48 w-full overflow-hidden bg-[var(--app-bg-sunken)]">
            {photoUrl ? (
              <>
                <PlacePhoto
                  src={photoUrl}
                  alt={photo?.alt ?? place.name}
                  glyph={glyph}
                  color={color}
                  sizes="(min-width: 640px) 600px, 100vw"
                  className="transition-transform duration-[600ms] ease-out group-hover:scale-[1.04]"
                  rounded="0"
                />
                {/* Gentle bottom scrim + faint top shade so the category
                    chip and any on-photo text stay legible over a bright
                    photo, while the middle of the image reads clean. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(0,0,0,0.34) 0%, transparent 30%, transparent 56%, rgba(0,0,0,0.50) 100%)",
                  }}
                />
              </>
            ) : (
              <CategoryGraphic
                category={place.category}
                seed={place.slug}
                className="absolute inset-0 transition-transform duration-[600ms] ease-out group-hover:scale-[1.04]"
              />
            )}
            {/* A crisp inner edge hugging the photo so it reads as set
                into the card, not pasted on — the refined-photo detail. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ boxShadow: "inset 0 0 0 1px rgba(20,20,18,0.10), inset 0 1px 0 rgba(255,255,255,0.12)" }}
            />
            {cat && (
              <span
                className="absolute left-2.5 top-2.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
                style={{
                  background: photoUrl ? color : `color-mix(in srgb, ${color} 22%, var(--app-bg-elevated))`,
                  color: photoUrl ? "white" : color,
                  boxShadow: photoUrl ? "0 2px 6px -1px rgba(0,0,0,0.30)" : "none",
                }}
              >
                {cat.name}
              </span>
            )}
            {place.distance_m !== undefined && (
              <span
                className="absolute bottom-2.5 right-2.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                style={{
                  background: "rgba(255,255,255,0.95)",
                  color: "var(--app-ink)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  boxShadow: "0 2px 6px -1px rgba(0,0,0,0.30)",
                }}
              >
                {formatDistance(place.distance_m)}
              </span>
            )}
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: color }} />
          </div>
          <div className="space-y-2.5 p-4">
            <div className="flex items-start gap-2">
              <h3 className="display-3 min-w-0 flex-1 text-balance leading-[1.12]" style={{ color: "var(--app-ink)" }}>
                {place.name}
              </h3>
              <SourceBadge place={place} size="sm" />
            </div>
            <p className="text-body truncate" style={{ color: "var(--app-ink-3)" }}>
              {cat?.name ?? place.category}
              {kf && (
                <>
                  {" · "}
                  <span style={{ color: "var(--app-ink-2)" }}>{kf}</span>
                </>
              )}
              <BeenHereIndicator slug={place.slug} />
            </p>
            {/* Food / photo strip — a horizontal scroll of the venue's
                other Google photos (dishes, interior, the patio). The
                single most-requested thing for a restaurant answer:
                "show me the food." Renders only when we actually have
                more than the hero. */}
            {stripPhotos.length > 0 && (
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 pt-0.5" style={{ scrollbarWidth: "none" }}>
                {stripPhotos.map((u, i) => (
                  <div
                    key={i}
                    className="relative h-[74px] w-[96px] shrink-0 overflow-hidden rounded-[12px] bg-[var(--app-bg-sunken)]"
                    style={{ boxShadow: "inset 0 0 0 1px rgba(20,20,18,0.08)" }}
                  >
                    <PlacePhoto src={u} alt={`${place.name} photo ${i + 1}`} glyph={glyph} color={color} sizes="96px" />
                  </div>
                ))}
              </div>
            )}
            {/* The decision row: open + closing time, rating, price —
                the three things that answer "can I go, is it good,
                what's it cost," each self-hiding when unknown. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <PlaceStatus status={place.open_status} />
              <Rave rating={place.google_rating} count={place.google_rating_count} />
              {place.price_band && (
                <span className="text-[12px] font-semibold" style={{ color: "var(--app-ink-3)" }}>
                  {"$".repeat(place.price_band)}
                </span>
              )}
            </div>
            {reasons.length > 0 && <StatusChipRow reasons={reasons} />}
            {/* "What people say" — a real, attributed Google review
                snippet. The single strongest word-of-mouth signal we
                hold, and it appears on no other card. Labelled as UGC,
                never passed off as our own copy. */}
            {place.review_snippet && (
              <blockquote
                className="mt-0.5 border-l-2 pl-2.5 text-[12.5px] italic leading-snug"
                style={{ borderColor: `color-mix(in srgb, ${color} 60%, transparent)`, color: "var(--app-ink-2)" }}
              >
                &ldquo;{place.review_snippet}&rdquo;
                {place.review_author && (
                  <cite className="mt-0.5 block text-[11px] not-italic" style={{ color: "var(--app-ink-3)" }}>
                    — {place.review_author}, Google
                  </cite>
                )}
              </blockquote>
            )}
            {/* "Loved for" — AI-extracted highlights from reviews, shown
                only when we actually have them. */}
            {loved.length > 0 && !place.review_snippet && (
              <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>Loved for</span>{" "}
                {loved.join(" · ")}
              </p>
            )}
          </div>
        </button>
        <div className="absolute right-2.5 top-2.5 z-10">
          <SaveButton refType="place" refId={place.slug} label={`Save ${place.name}`} />
        </div>
      </article>
    );
  }

  // Fixed-width, photo-forward tile for horizontal shelves. Crafted the
  // same whether or not a photo exists — most DFP places have none, so a
  // tonal category panel stands in so a shelf never looks broken.
  if (variant === "tile") {
    // Bottom-left "on-photo" status pill: the highest-priority
    // placeReason ("Open · closes 9 PM", "Verified", etc) doubles
    // as the Airbnb-style "Guest favorite" chip riding on the
    // image. Picking the first reason keeps a single signal
    // surfaced where the photo gradient is already paying for it.
    const reasons = placeReasons(place);
    const onPhotoReason = reasons[0];
    const bodyReasons = reasons.slice(1);
    return (
      <article
        className="tactile tactile-interactive group relative w-[244px] shrink-0 overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]"
        style={{
          borderColor: "var(--app-border)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        <button
          type="button"
          onClick={openDetail}
          aria-label={`View ${place.name} details`}
          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        >
          {/* Photo banner — 160 → 180px (more cinematic, room for
              top + bottom chips without crowding the upper image). */}
          <div className="relative h-[180px] w-full overflow-hidden bg-[var(--app-bg-sunken)]">
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
                {/* Stronger bottom gradient pulls the on-photo status
                    pill off the image cleanly; the upper image stays
                    bright. Same recipe as EventCard tile. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(0,0,0,0.30) 0%, transparent 35%, transparent 55%, rgba(0,0,0,0.65) 100%)",
                  }}
                />
              </>
            ) : (
              <CategoryGraphic
                category={place.category}
                seed={place.slug}
                className="absolute inset-0 transition-transform duration-[600ms] ease-out group-hover:scale-[1.04]"
              />
            )}
            {/* Category chip — top-left. Glass treatment on photos,
                soft tint when no photo. */}
            {cat && (
              <span
                className="absolute left-2 top-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
                style={{
                  background: photoUrl ? color : `color-mix(in srgb, ${color} 22%, var(--app-bg-elevated))`,
                  color: photoUrl ? "white" : color,
                  boxShadow: photoUrl
                    ? "0 2px 6px -1px rgba(0,0,0,0.30)"
                    : "none",
                }}
              >
                {cat.name}
              </span>
            )}
            {/* On-photo status pill, bottom-left. The Airbnb "Guest
                favorite" pattern — the single most useful decision
                signal sits ON the photo so the user reads it without
                scanning the body. */}
            {photoUrl && onPhotoReason && (
              <span
                className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  background: "rgba(255,255,255,0.95)",
                  color: "var(--app-ink)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  boxShadow: "0 2px 6px -1px rgba(0,0,0,0.30)",
                }}
              >
                {onPhotoReason.label}
              </span>
            )}
            {/* Category color band along the bottom edge — the
                through-line that ties cards to their type. */}
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
                  / Community / Official). Self-hides when there's no honest
                  claim; suppressed in dense lists via showSource. */}
              {showSource && <SourceBadge place={place} size="sm" />}
            </div>
            <p
              className="truncate text-[12px]"
              style={{ color: "var(--app-ink-3)" }}
            >
              {cat?.name ?? place.category}
              {place.known_for?.[0] && (
                <>
                  {" · "}
                  <span style={{ color: "var(--app-ink-2)" }}>
                    {place.known_for[0]}
                  </span>
                </>
              )}
              {place.distance_m !== undefined && (
                <> · {formatDistance(place.distance_m)}</>
              )}
              <BeenHereIndicator slug={place.slug} />
            </p>
            {/* Body reasons — REMAINING reasons after the on-photo
                pill (or all reasons when no photo to ride on). Falls
                back to the legacy status+rating row if placeReasons
                returns empty. */}
            {(() => {
              const remaining = photoUrl ? bodyReasons : reasons;
              return remaining.length > 0 ? (
                <ReasonChipRow reasons={remaining} className="pt-0.5" />
              ) : !photoUrl && reasons.length === 0 ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <PlaceStatus status={place.open_status} className="!text-[12px]" />
                  <Rave
                    rating={place.google_rating}
                    count={place.google_rating_count}
                    className="!text-[12px]"
                  />
                </div>
              ) : null;
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
              <BeenHereIndicator slug={place.slug} />
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
      className="tactile tactile-interactive tactile-e2 group relative flex items-stretch gap-3.5 rounded-[var(--app-radius-lg)] p-3"
      style={{ background: "var(--app-bg-elevated-solid)" }}
    >
      {photoUrl ? (
        <div
          className="relative h-[78px] w-[78px] shrink-0 self-center overflow-hidden rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)]"
          style={{
            // Crisp inner edge + a 1px top highlight + a soft ambient
            // drop, so the thumbnail reads as a physical chip sitting on
            // the card — the same tactile register as the lane tiles.
            boxShadow:
              "var(--app-edge), inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px -3px rgba(20,20,18,0.22)",
          }}
        >
          <PlacePhoto
            src={photoUrl}
            alt={photo?.alt ?? place.name}
            glyph={glyph}
            color={color}
            sizes="78px"
            className="transition-transform duration-500 ease-out group-hover:scale-[1.06]"
          />
          {/* A gentle top sheen + bottom shade so the photo has volume,
              not a flat crop; the category hairline anchors its base. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, transparent 28%, transparent 72%, rgba(0,0,0,0.18) 100%)" }}
          />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[2.5px]"
            style={{ background: color }}
          />
        </div>
      ) : (
        <div
          aria-hidden
          className="flex h-[78px] w-[78px] shrink-0 self-center items-center justify-center rounded-[var(--app-radius-md)]"
          style={{
            background: `linear-gradient(145deg, color-mix(in srgb, ${color} 22%, var(--app-bg-elevated-solid)), color-mix(in srgb, ${color} 7%, var(--app-bg-elevated-solid)))`,
            color,
            boxShadow: "var(--app-edge), inset 0 1px 0 rgba(255,255,255,0.45)",
          }}
        >
          <CategoryIcon slug={place.category} strokeWidth={1.75} className="h-8 w-8 opacity-90" style={{ color }} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={openDetail}
            aria-label={`View ${place.name} details`}
            className="line-clamp-2 min-w-0 flex-1 text-left text-[15.5px] font-semibold leading-[1.2] tracking-tight outline-none focus-visible:underline"
            style={{ color: "var(--app-ink)" }}
          >
            <span className="absolute inset-0" aria-hidden />
            {place.name}
          </button>
          {/* SourceBadge — same trust tier surfacing as the detail
              page, set inline next to the name. Self-hides when there's
              nothing honest to claim; suppressed in dense lists via
              showSource so the badge isn't repeated down every row. */}
          {showSource && <SourceBadge place={place} size="sm" />}
          {place.distance_m !== undefined && (
            <span className="ml-auto mt-[1px] shrink-0 whitespace-nowrap text-[12px] font-medium tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              {formatDistance(place.distance_m)}
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          {cat?.name ?? place.category}
          {kf && <> · {kf}</>}
          <BeenHereIndicator slug={place.slug} />
        </p>
        {!compact && (() => {
          // Status chips on the row variant — same producer as grid +
          // tile, dressed in the tactile chip language. Falls back to
          // the legacy status / rating / price row only if
          // placeReasons() returns nothing.
          const reasons = placeReasons(place);
          if (reasons.length > 0) {
            return <StatusChipRow reasons={reasons} className="mt-2" />;
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
