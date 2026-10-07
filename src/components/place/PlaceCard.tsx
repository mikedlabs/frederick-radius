"use client";

import { useState, useSyncExternalStore } from "react";
import { usePlacePhoto } from "@/components/place/usePlacePhoto";
import RadiusPhoto from "@/components/ui/RadiusPhoto";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { PlaceCardData } from "@/lib/loaders/places";
import OpenClosedDot from "./OpenClosedDot";
import { formatDistance } from "@/lib/geo";
import SaveButton from "@/components/saved/SaveButton";
import { usePlaceSheet } from "./PlaceSheetProvider";
import { haptic } from "@/lib/haptics";
import PlaceStatus from "./PlaceStatus";
import { curatedKnownFor, knownFor, placeTypeLabel } from "@/lib/cuisine";
import { Star, NotebookPen, Tag } from "lucide-react";
import SourceBadge from "./SourceBadge";
import FieldNoteTag from "./FieldNoteTag";
import { ReasonChipRow, type ReasonTone } from "@/components/ui/ReasonChip";
import {
  placeReasons,
  placeRowMark,
  streetLine,
  type PlaceReasonChip,
  type PlaceRowMark,
} from "@/lib/place-reasons";

/**
 * PlaceCard — the shared business card across browse and recommendation
 * surfaces. A verified, individually attributable place photo leads when one
 * is available; the category mark is the fallback. The canonical loader has
 * already removed shared, mismatched, or unattributed images.
 */

/** Minimum Google review count before a rating is worth printing. */
const RATING_MIN_COUNT = 20;

/**
 * The one star color for place ratings on browse rows (PlaceCard and
 * PlaceIndex). Ratings are supporting data, so they sit in neutral ink; Plum
 * is limited to arts and Amber to live or caution states.
 */
export const RATING_STAR_COLOR = "var(--app-ink-2)";

/**
 * A Google rating with its review count: "★ 4.6 (1,728)". Only when there is
 * a real rating with enough reviews to mean something (20 or more); most DFP
 * rows have no rating and show nothing, never a fabricated score. The
 * "Google Maps" source label stays beside the figure because Google's terms
 * require attribution wherever Places data shows without a Google map.
 */
export function PlaceRating({
  rating,
  count,
  className = "",
}: {
  rating?: number | null;
  count?: number | null;
  className?: string;
}) {
  if (!rating || !count || count < RATING_MIN_COUNT) return null;
  return (
    <span
      data-place-rating
      className={`inline-flex items-center gap-1 tabular-nums ${className}`}
      style={{ color: "var(--app-ink-2)" }}
      title={`${rating.toFixed(1)} from ${count.toLocaleString("en-US")} Google reviews`}
    >
      <Star className="h-3 w-3 shrink-0" strokeWidth={0} fill={RATING_STAR_COLOR} aria-hidden />
      <span className="font-semibold">{rating.toFixed(1)}</span>
      <span style={{ color: "var(--app-ink-3)" }}>({count.toLocaleString("en-US")})</span>
      <span className="text-caption" style={{ color: "var(--app-ink-3)" }} translate="no">
        Google Maps
      </span>
    </span>
  );
}

/**
 * Tactile status chips for the result cards. Same tone vocabulary +
 * color tokens as ReasonChip, but dressed in the front-door tile's
 * "made" language. Restyle only — every chip here comes straight from
 * placeReasons(), so no badge is ever invented. Quality chips (Local
 * favorite, Hidden gem, Top rated) sit in neutral ink: Plum is reserved for
 * arts and editorial accents.
 */
const CHIP_TONE: Record<ReasonTone, { color: string; tint: string; edge: string; dot?: boolean }> = {
  open:     { color: "var(--app-positive)", tint: "var(--app-positive-tint-14)", edge: "color-mix(in srgb, var(--app-positive) 26%, transparent)", dot: true },
  near:     { color: "var(--app-cool)",     tint: "var(--app-cool-tint-14)",     edge: "color-mix(in srgb, var(--app-cool) 24%, transparent)" },
  verified: { color: "var(--app-positive)",  tint: "color-mix(in srgb, var(--app-positive) 14%, transparent)", edge: "color-mix(in srgb, var(--app-positive) 26%, transparent)" },
  free:     { color: "var(--app-positive)", tint: "var(--app-positive-tint-14)", edge: "color-mix(in srgb, var(--app-positive) 26%, transparent)" },
  rated:    { color: "var(--app-ink-2)",    tint: "var(--app-ink-tint-6)",       edge: "var(--app-ink-tint-12)" },
  neutral:  { color: "var(--app-ink-2)",    tint: "var(--app-ink-tint-6)",       edge: "var(--app-ink-tint-12)" },
};

function StatusChip({ label, tone = "neutral" }: { label: string; tone?: ReasonTone }) {
  const t = CHIP_TONE[tone];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-semibold leading-none tracking-tight"
      style={{
        color: t.color,
        background: t.tint,
        boxShadow: `inset 0 0 0 1px ${t.edge}, inset 0 1px 0 rgba(255,255,255,0.45)`,
      }}
    >
      {t.dot && (
        <span aria-hidden className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: t.color }} />
      )}
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

/**
 * Per-place colors for the photoless mark (src/data/place-hues.json, 1,287
 * places, about 21 KB gzipped). The table loads as its own chunk after the
 * first render instead of riding in every list page's bundle: a row first
 * needs it when its photo fails, which is a network round trip later. Until
 * it arrives, and on the server, a mark wears its quiet category tint.
 */
type HueTable = Record<string, string>;
let hueTable: HueTable | null = null;
let hueRequest: Promise<void> | null = null;
const hueListeners = new Set<() => void>();
const HEX_HUE = /^#[0-9a-f]{6}$/i;

function requestHueTable() {
  if (hueTable || hueRequest || typeof window === "undefined") return;
  hueRequest = import("@/data/place-hues.json")
    .then((module) => {
      hueTable = (module.default ?? module) as unknown as HueTable;
      for (const listener of hueListeners) listener();
    })
    .catch(() => {
      // A failed chunk leaves the category tint in place; the next mounted
      // row may try again.
      hueRequest = null;
    });
}

function subscribeToHues(listener: () => void) {
  hueListeners.add(listener);
  requestHueTable();
  return () => {
    hueListeners.delete(listener);
  };
}

/** The place's own color for its photoless mark, or null. */
export function usePlaceHue(slug: string): string | null {
  const table = useSyncExternalStore(
    subscribeToHues,
    () => hueTable,
    () => null,
  );
  const hue = table?.[slug];
  return hue && HEX_HUE.test(hue) ? hue : null;
}

/**
 * Thumb — the leading visual on a browse card, painted by RadiusPhoto. It
 * shows the place's real Google photo (the same curated, de-twinned source as
 * the detail page; PHOTO_SUPPRESS has already nulled shared or duplicate
 * photos) once it has actually loaded. RadiusPhoto asks the proxy for its
 * failure signal and narrows the request to the painted width, so a daily cap
 * never crops the proxy's plate into a thumbnail. Without a photo the frame is
 * the category mark on the place's own flat color, mixed toward Ink: a mark,
 * never a gradient or an initial pretending to be a picture.
 */
function Thumb({
  place,
  category,
  color,
  size,
  lazyPhoto = false,
}: {
  place: PlaceCardData;
  category: string;
  color: string;
  size: number;
  /** Hydrate the photo on scroll when the surface withheld inline URLs
   *  (slimForNearby strips them — they were ~64% of /nearby's transfer).
   *  Resolution goes through /api/places/by-slugs, so the suppression
   *  verdicts keep applying; the glyph carries "not yet" and "none" alike. */
  lazyPhoto?: boolean;
}) {
  const { photoUrl, anchorRef } = usePlacePhoto(
    place.slug,
    place.google_photo_url,
    lazyPhoto,
  );
  const hue = usePlaceHue(place.slug);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showing = photoUrl && failedUrl !== photoUrl ? "photo" : "category";
  return (
    <div
      ref={anchorRef}
      data-place-thumb={showing}
      className="shrink-0"
      style={{ height: size, width: size }}
    >
      <RadiusPhoto
        src={photoUrl}
        size={size}
        category={category}
        hue={hue}
        color={color}
        className="rounded-[var(--app-radius-md)]"
        onMissing={() => setFailedUrl(photoUrl ?? null)}
      />
    </div>
  );
}

/**
 * The single mark a row carries (see placeRowMark): a verified deal figure or
 * Field Notes in Brick press, any other editorial reason in neutral ink.
 * Plain type with a small glyph, never a filled pill.
 */
function RowMark({ mark }: { mark: PlaceRowMark }) {
  const brand = mark.tone !== "neutral";
  const Icon = mark.tone === "deal" ? Tag : mark.tone === "notes" ? NotebookPen : null;
  return (
    <span
      data-row-mark={mark.kind}
      className="inline-flex min-w-0 items-center gap-1 font-semibold"
      style={{ color: brand ? "var(--app-brand-press)" : "var(--app-ink-2)" }}
      title={mark.tone === "deal" ? `Verified deal on file: ${mark.label}` : undefined}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />}
      <span className="truncate">{mark.label}</span>
    </span>
  );
}

export default function PlaceCard({
  place,
  variant = "row",
  // Default OFF for dense-list variants (row/tile/grid), where a repeated
  // badge becomes "chip soup" down the margin; ON for the prominent
  // answer/feature lead. Override explicitly anywhere it's wanted.
  showSource = variant === "answer" || variant === "feature",
  neutral = false,
  lazyPhoto = false,
}: {
  place: PlaceCardData;
  /** Legacy: compact rows used to drop the status, rating and price line,
   *  which left list mode telling places apart by name alone. Every row now
   *  keeps it; the prop is accepted so existing callers compile. */
  compact?: boolean;
  variant?: "row" | "feature" | "tile" | "grid" | "answer";
  /** Hydrate the photo on scroll; set by surfaces that withhold inline
   *  photo URLs from their payload (see Thumb). */
  lazyPhoto?: boolean;
  /** Show the source/trust badge. Defaults by variant (off in dense lists,
   *  on for the lead); the full trust tier still lives on the detail sheet. */
  showSource?: boolean;
  /** Neutral mode (the /map in-view list): drop the editorial "why" reason
   *  chips (Local favorite, Hidden gem, Top rated, Near {landmark}, walk time)
   *  so the card just reflects the place — name, category, open/closed — with
   *  no app-chosen verdicts. Open/closed still shows via PlaceStatus. */
  neutral?: boolean;
  /** Legacy: extra photos for the old answer photo strip. The shared card uses
   *  the canonical hero only; kept in the type so existing callers compile. */
  galleryPhotos?: string[];
}) {
  const cat = CATEGORY_BY_SLUG[place.category];
  const color = cat?.color ?? "var(--app-brand)";
  const { openSheet } = usePlaceSheet();
  const openDetail = () => { haptic("light"); openSheet(place); };
  // Chain locations often share the same visible name. Give every card action
  // enough location context for voice control and screen readers to distinguish
  // the downtown result from the one across the county.
  const actionName = place.address
    ? `${place.name} at ${place.address}`
    : place.city
      ? `${place.name} in ${place.city}`
      : place.name;
  // "Known for" — the real descriptive blurb, or null for DFP filler. The
  // lead variants (feature, answer) have room for it; rows never print it.
  const kf = knownFor(place);
  // Neutral mode drops the editorial "why" chips entirely (the /map list is a
  // reflection of the map, not a ranked pick); open/closed still shows via the
  // variant's PlaceStatus. Every variant prints the distance itself, so the
  // proximity chip never repeats it.
  const reasons = neutral ? [] : placeReasons(place, undefined, { distanceShown: true });
  // Where the card ALSO renders an explicit open indicator (the tile's
  // status dot, the feature/answer PlaceStatus line), the leading "Open"
  // reason chip just echoes it. Drop it there so the two visible chips
  // carry NEW signal (Local favorite, Dog-friendly) instead of repeating
  // the dot. Grid keeps the full set, because there the chip is the ONLY
  // open signal. The row prints PlaceStatus and takes one mark instead.
  const nonOpenReasons = reasons.filter(
    (r) => r.kind !== "open_now" && r.kind !== "verified_open",
  );

  // ── FEATURE — the prominent promoted lead (Today "Worth a look", a
  // category page lead). Text-led: a larger category mark, a serif title,
  // the why-chips, open status, and distance when we have it. A category
  // accent rail ties it to its type without a photo banner.
  if (variant === "feature") {
    return (
      <article
        className="tactile tactile-interactive group relative overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)]"
        style={{ boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
      >
        <div aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
        <button
          type="button"
          onClick={openDetail}
          aria-label={`View ${actionName} details`}
          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        >
          <div className="flex items-start gap-3 p-4 pl-5">
            <Thumb place={place} category={place.category} color={color} size={52} lazyPhoto={lazyPhoto} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <h3 className="min-w-0 flex-1 truncate font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                  {place.name}
                </h3>
                {place.distance_m !== undefined && (
                  <span className="shrink-0 whitespace-nowrap text-xs tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                    {formatDistance(place.distance_m)}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs" style={{ color: "var(--app-ink-3)" }}>
                {cat?.name ?? place.category}
                {(place.known_for?.[0] ?? kf) && (
                  <> · <span style={{ color: "var(--app-ink-2)" }}>{place.known_for?.[0] ?? kf}</span></>
                )}
              </p>
              {place.field_note_tip && (
                <p className="mt-1.5 flex gap-1.5 text-[12px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                  <NotebookPen className="mt-[2px] h-3 w-3 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-brand-press)" }} aria-hidden />
                  <span className="line-clamp-2">{place.field_note_tip}</span>
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                <PlaceStatus status={place.open_status} className="!text-[12px]" />
                {place.deal_hook ? <RowMark mark={{ kind: "deal", label: place.deal_hook, tone: "deal" }} /> : place.field_notes && !place.field_note_tip ? <FieldNoteTag /> : null}
                {nonOpenReasons.length > 0 ? (
                  <StatusChipRow reasons={nonOpenReasons} />
                ) : (
                  <PlaceRating rating={place.google_rating} count={place.google_rating_count} className="text-meta" />
                )}
              </div>
            </div>
          </div>
        </button>
        <div className="absolute right-2.5 top-2.5 z-10">
          <SaveButton refType="place" refId={place.slug} label={`Save ${actionName}`} />
        </div>
      </article>
    );
  }

  // ── ANSWER — the funnel's lead pick. Keeps the full honest signal block
  // (open + closing time, why-chips, rating, price, the attributed review
  // snippet) — the richest text card we have — now headed by a category
  // mark instead of a photo banner. No imported imagery.
  if (variant === "answer") {
    const loved = (place.customers_loved ?? []).slice(0, 3);
    return (
      <article
        className="tactile tactile-e3 tactile-interactive group relative overflow-hidden rounded-[var(--app-radius-lg)]"
        style={{
          backgroundColor: "var(--app-bg-elevated-solid)",
          backgroundImage: "var(--app-paper-light)",
        }}
      >
        <div aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: color }} />
        <button
          type="button"
          onClick={openDetail}
          aria-label={`View ${actionName} details`}
          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        >
          <div className="space-y-2.5 p-4">
            <div className="flex items-start gap-3">
              <Thumb place={place} category={place.category} color={color} size={48} lazyPhoto={lazyPhoto} />
              <div className="min-w-0 flex-1">
                {/* pr-9 clears the absolutely-positioned SaveButton (36px at
                    right-2.5) so the ml-auto distance never renders under it. */}
                <div className="flex items-center gap-2 pr-9">
                  <span className="truncate text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color }}>
                    {cat?.name ?? place.category}
                  </span>
                  {place.distance_m !== undefined && (
                    <span className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                      {formatDistance(place.distance_m)}
                    </span>
                  )}
                </div>
                <h3 className="display-3 mt-0.5 text-balance leading-[1.12]" style={{ color: "var(--app-ink)" }}>
                  {place.name}
                </h3>
              </div>
            </div>
            {kf && (
              <p className="text-body" style={{ color: "var(--app-ink-2)" }}>
                {kf}
              </p>
            )}
            {/* The decision row: open + closing time, rating, price. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <PlaceStatus status={place.open_status} />
              <PlaceRating rating={place.google_rating} count={place.google_rating_count} className="text-meta" />
              {place.price_band && (
                <span className="text-[12px] font-semibold" style={{ color: "var(--app-ink-3)" }}>
                  {"$".repeat(place.price_band)}
                </span>
              )}
              {place.field_notes && !place.field_note_tip && <FieldNoteTag />}
            </div>
            {nonOpenReasons.length > 0 && <StatusChipRow reasons={nonOpenReasons} />}
            {/* Voice line, in priority order: the VERIFIED field note (the moat's
                own intel) leads over a Google review snippet, which leads over the
                "Loved for" tag list. One voice, never stacked. */}
            {place.field_note_tip ? (
              <p className="flex gap-1.5 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                <NotebookPen className="mt-[2px] h-3.5 w-3.5 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-brand-press)" }} aria-hidden />
                <span className="line-clamp-2">{place.field_note_tip}</span>
              </p>
            ) : loved.length > 0 ? (
              <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>Loved for</span>{" "}
                {loved.join(" · ")}
              </p>
            ) : null}
          </div>
        </button>
        <div className="absolute right-2.5 top-2.5 z-10">
          <SaveButton refType="place" refId={place.slug} label={`Save ${actionName}`} />
        </div>
      </article>
    );
  }

  // ── TILE — fixed-width card for horizontal shelves. Text-led: a category
  // mark + open dot header, the name, type/known-for/distance, and chips. A
  // category color band along the bottom is the through-line that ties cards
  // to their type (a line, not a photo).
  if (variant === "tile") {
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
          aria-label={`View ${actionName} details`}
          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        >
          <div className="space-y-2 p-3.5 pb-4">
            <div className="flex items-center gap-2.5">
              <Thumb place={place} category={place.category} color={color} size={40} lazyPhoto={lazyPhoto} />
              <span className="truncate text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color }}>
                {cat?.name ?? place.category}
              </span>
              <span className="ml-auto">
                <OpenClosedDot status={place.open_status} />
              </span>
            </div>
            <h3 className="text-[15px] font-semibold leading-snug tracking-tight" style={{ color: "var(--app-ink)" }}>
              {place.name}
            </h3>
            {/* Subtitle no longer echoes the category — the uppercase
                header already states it. Lead with what's NEW (known-for),
                then distance; nothing repeated. */}
            <p className="truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              {place.known_for?.[0] && (
                <span style={{ color: "var(--app-ink-2)" }}>{place.known_for[0]}</span>
              )}
              {place.distance_m !== undefined && (
                <>{place.known_for?.[0] ? " · " : ""}{formatDistance(place.distance_m)}</>
              )}
            </p>
            {place.deal_hook ? (
              <span className="text-meta block"><RowMark mark={{ kind: "deal", label: place.deal_hook, tone: "deal" }} /></span>
            ) : place.field_notes ? <FieldNoteTag compact /> : null}
            {nonOpenReasons.length > 0 ? (
              <ReasonChipRow reasons={nonOpenReasons.slice(0, 2)} className="pt-0.5" />
            ) : (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <PlaceStatus status={place.open_status} className="!text-[12px]" />
                <PlaceRating rating={place.google_rating} count={place.google_rating_count} className="text-meta" />
              </div>
            )}
          </div>
          <div aria-hidden className="h-[3px] w-full" style={{ background: color }} />
        </button>
        {showSource && (
          <div className="absolute right-2 top-2 z-10">
            <SourceBadge place={place} size="sm" />
          </div>
        )}
        <div className="absolute bottom-2 right-2 z-10">
          <SaveButton refType="place" refId={place.slug} label={`Save ${actionName}`} />
        </div>
      </article>
    );
  }

  // ── GRID — compact responsive cell. Leading category mark, tight text,
  // chips. ~a third the footprint of a tile.
  if (variant === "grid") {
    return (
      <article className="tactile tactile-interactive group relative overflow-hidden rounded-[var(--app-radius-md)] bg-[var(--app-bg-elevated)]">
        <button
          type="button"
          onClick={openDetail}
          aria-label={`View ${actionName} details`}
          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        >
          <div className="flex items-start gap-2.5 p-2.5">
            <Thumb place={place} category={place.category} color={color} size={40} lazyPhoto={lazyPhoto} />
            <div className="min-w-0 flex-1 space-y-0.5">
              <h3 className="line-clamp-2 text-[14px] font-semibold leading-[1.2] tracking-tight" style={{ color: "var(--app-ink)" }}>
                {place.name}
              </h3>
              <p className="truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                {cat?.name ?? place.category}
                {place.distance_m !== undefined && <> · {formatDistance(place.distance_m)}</>}
              </p>
              {place.deal_hook ? (
                <span className="text-caption block"><RowMark mark={{ kind: "deal", label: place.deal_hook, tone: "deal" }} /></span>
              ) : place.field_notes ? <FieldNoteTag compact /> : null}
              {reasons.length > 0 ? (
                <ReasonChipRow reasons={reasons.slice(0, 2)} className="pt-0.5" />
              ) : (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <PlaceStatus status={place.open_status} className="!text-[11px]" />
                  <PlaceRating rating={place.google_rating} count={place.google_rating_count} className="text-caption" />
                </div>
              )}
            </div>
          </div>
          <div aria-hidden className="h-[2px] w-full" style={{ background: color }} />
        </button>
      </article>
    );
  }


  // ── ROW (default) — the picture row, the workhorse of every list.
  //
  // Visual first (docs/VISUAL_FIRST.md): a 48px tile leads, the loaded photo
  // or the category mark on the place's own color. Then the name, and one
  // fact line that tells this place from its neighbours: what it is, from
  // Google's structured type ("Barbecue", not "Restaurants" 183 times), and
  // its street. Curated known_for may replace the type label; scraped blurbs
  // never reach a row. A signal line follows with status, a rating with its
  // review count, price and at most one mark. Distance prints once, at the
  // right of the name.
  //
  // Rows are flat: no paper card, no category rail and no per-row shadow.
  // A 1px rule separates them, so a long list scans as names and pictures,
  // not a stack of boxes. The whole row opens the single PlaceSheet; Save is
  // its own 44px target.
  const typeLabel =
    curatedKnownFor(place) ?? placeTypeLabel(place, cat) ?? place.category;
  const factLine = [typeLabel, streetLine(place.address)]
    .filter(Boolean)
    .join(" · ");
  const fullMark = placeRowMark(place);
  // Neutral mode (the /map list) keeps facts (a verified deal, Field Notes)
  // and drops app-chosen verdicts such as Local favorite.
  const mark = neutral && fullMark?.tone === "neutral" ? null : fullMark;
  const hasRating =
    Boolean(place.google_rating) &&
    (place.google_rating_count ?? 0) >= RATING_MIN_COUNT;
  const hasStatus =
    place.open_status.state !== "unknown" &&
    place.open_status.state !== "unverified";
  const hasSignals = hasStatus || hasRating || Boolean(place.price_band) || Boolean(mark);
  return (
    <article
      data-place-row
      className="group relative flex items-center gap-3 border-b py-2.5 pl-0.5"
      style={{ borderColor: "var(--app-border)" }}
    >
      <button
        type="button"
        onClick={openDetail}
        aria-label={`View ${actionName} details`}
        className="absolute inset-0 z-0 rounded-[var(--app-radius-sm)] text-left outline-none transition-colors hover:bg-[var(--app-bg-sunken)] active:bg-[var(--app-bg-sunken)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)]"
      />
      <div className="pointer-events-none relative z-10 self-start">
        <Thumb place={place} category={place.category} color={color} size={48} lazyPhoto={lazyPhoto} />
      </div>
      <div className="pointer-events-none relative z-10 min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            aria-hidden
            className="text-title-sm line-clamp-1 min-w-0 flex-1"
            style={{ color: "var(--app-ink)" }}
          >
            {place.name}
          </span>
          {showSource && <SourceBadge place={place} size="sm" />}
          {place.distance_m !== undefined && (
            <span
              data-place-distance
              className="text-meta-lg shrink-0 whitespace-nowrap tabular-nums"
              style={{ color: "var(--app-ink-3)" }}
            >
              {formatDistance(place.distance_m)}
            </span>
          )}
        </div>
        <p data-place-facts className="text-meta-lg truncate" style={{ color: "var(--app-ink-2)" }}>
          {factLine}
        </p>
        {place.market_day && (
          <p className="text-meta-lg truncate font-medium" style={{ color: "var(--app-brand-press)" }}>
            {place.market_day}{place.market_hours ? ` · ${place.market_hours}` : ""}
          </p>
        )}
        {hasSignals && (
          <div className="text-meta-lg mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
            <PlaceStatus status={place.open_status} className="!text-[13px]" />
            <PlaceRating rating={place.google_rating} count={place.google_rating_count} />
            {place.price_band && (
              <span style={{ color: "var(--app-ink-3)" }}>
                {"$".repeat(place.price_band)}
              </span>
            )}
            {mark && <RowMark mark={mark} />}
          </div>
        )}
      </div>
      <div className="relative z-10 self-center">
        <SaveButton refType="place" refId={place.slug} label={`Save ${actionName}`} />
      </div>
    </article>
  );
}
