"use client";

import Image from "next/image";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { PlaceCardData } from "@/lib/loaders/places";
import OpenClosedDot from "./OpenClosedDot";
import { formatDistance } from "@/lib/geo";
import SaveButton from "@/components/saved/SaveButton";
import { usePlaceSheet } from "./PlaceSheetProvider";
import { haptic } from "@/lib/haptics";
import PlaceStatus from "./PlaceStatus";
import { knownFor } from "@/lib/cuisine";
import { Star, NotebookPen } from "lucide-react";
import CategoryIcon from "./CategoryIcon";
import SourceBadge from "./SourceBadge";
import FieldNoteTag, { DealHookTag } from "./FieldNoteTag";
import { ReasonChipRow, type ReasonTone } from "@/components/ui/ReasonChip";
import { placeReasons, type PlaceReasonChip } from "@/lib/place-reasons";

/**
 * PlaceCard — the unified TYPOGRAPHIC browse card (Photo Policy, Phase 1).
 *
 * Browse/list/recommendation surfaces do NOT render imported photography
 * (Google / Wikimedia / uncontrolled hero_image). 89% of place photos were
 * imported and ~96% of those were un-curated, with provenance/duplicate
 * problems (#437) — too inconsistent to carry the main UI. Every variant
 * here leads with a small category mark + a clear text hierarchy:
 *   category/icon mark · title · type/town · open status · reason chips ·
 *   distance (only when present) · source/freshness.
 * Built from existing primitives (CategoryIcon, ReasonChip, StatusChipRow,
 * SourceBadge) — no new design system. Photography lives on DETAIL pages
 * (PlaceHero / gallery / AerialBeat), not here. See docs/PHOTO_POLICY.md.
 */

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
    </span>
  );
}

/**
 * Tactile status chips for the result cards. Same tone vocabulary +
 * color tokens as ReasonChip, but dressed in the front-door tile's
 * "made" language. Restyle only — every chip here comes straight from
 * placeReasons(), so no badge is ever invented.
 */
const CHIP_TONE: Record<ReasonTone, { color: string; tint: string; edge: string; dot?: boolean }> = {
  open:     { color: "var(--app-positive)", tint: "var(--app-positive-tint-14)", edge: "color-mix(in srgb, var(--app-positive) 26%, transparent)", dot: true },
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
 * The category mark — the leading visual token that replaces the imported
 * photo. A tinted, light-catching rounded square holding the category's
 * own icon. Small and typographic by design: it signals *type* at a glance
 * without pretending to be a photograph of the place. The single source of
 * "place imagery" in browse.
 */
function CategoryMark({
  category,
  color,
  size = 44,
}: {
  category: string;
  color: string;
  size?: number;
}) {
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-[var(--app-radius-md)]"
      style={{
        height: size,
        width: size,
        // Quiet, low-tint chip — it signals type without competing with the
        // title. Down a long list the eye reads the names, not a column of
        // saturated blocks (the "supports, not dominates" rule).
        background: `color-mix(in srgb, ${color} 11%, var(--app-bg-elevated-solid))`,
        color,
        boxShadow: "inset 0 0 0 1px color-mix(in srgb, " + color + " 16%, transparent)",
      }}
    >
      <CategoryIcon
        slug={category}
        strokeWidth={1.75}
        className="opacity-80"
        style={{ color, height: Math.round(size * 0.44), width: Math.round(size * 0.44) }}
      />
    </div>
  );
}

/**
 * Thumb — the leading visual on a browse card. Shows the place's real
 * Google photo (the same curated, de-twinned source as the detail page;
 * PHOTO_SUPPRESS has already nulled shared/duplicate photos so we never
 * show a wrong one) and falls back to the calm category mark when a place
 * has no photo. "Real photo when we have a good one, type mark when we
 * don't" — visual, but never a fabricated or mismatched image.
 */
function Thumb({
  place,
  category,
  color,
  size,
  noPhoto = false,
}: {
  place: PlaceCardData;
  category: string;
  color: string;
  size: number;
  noPhoto?: boolean;
}) {
  if (place.google_photo_url && !noPhoto) {
    return (
      <div
        className="relative shrink-0 overflow-hidden rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)]"
        style={{ height: size, width: size, boxShadow: "inset 0 0 0 1px var(--app-ink-tint-8)" }}
      >
        <Image
          src={place.google_photo_url}
          alt=""
          fill
          sizes="72px"
          placeholder="blur"
          blurDataURL={PAPER_CREAM_BLUR}
          className="object-cover"
        />
      </div>
    );
  }
  return <CategoryMark category={category} color={color} size={size} />;
}

export default function PlaceCard({
  place,
  compact = false,
  variant = "row",
  // Default OFF for dense-list variants (row/tile/grid), where a repeated
  // badge becomes "chip soup" down the margin; ON for the prominent
  // answer/feature lead. Override explicitly anywhere it's wanted.
  showSource = variant === "answer" || variant === "feature",
  noPhoto = false,
  neutral = false,
}: {
  place: PlaceCardData;
  compact?: boolean;
  variant?: "row" | "feature" | "tile" | "grid" | "answer";
  /** Show the source/trust badge. Defaults by variant (off in dense lists,
   *  on for the lead); the full trust tier still lives on the detail sheet. */
  showSource?: boolean;
  /** Neutral mode (the /map in-view list): drop the editorial "why" reason
   *  chips (Local favorite, Hidden gem, Top rated, Near {landmark}, walk time)
   *  so the card just reflects the place — name, category, open/closed — with
   *  no app-chosen verdicts. Open/closed still shows via PlaceStatus. */
  neutral?: boolean;
  /** Force the typographic category mark instead of the photo thumbnail.
   *  The Map bottom-sheet uses this — map results are compact decision
   *  cards, not photo cards (the Map redesign brief). */
  noPhoto?: boolean;
  /** Legacy: extra photos for the old answer photo strip. Browse cards are
   *  typographic now (Photo Policy), so this is no longer rendered — kept in
   *  the type so existing callers compile without churn. */
  galleryPhotos?: string[];
}) {
  const cat = CATEGORY_BY_SLUG[place.category];
  const color = cat?.color ?? "var(--app-brand)";
  const { openSheet } = usePlaceSheet();
  const openDetail = () => { haptic("light"); openSheet(place); };
  // "Known for" — the real descriptive blurb, or null for DFP filler.
  const kf = knownFor(place);
  // Neutral mode drops the editorial "why" chips entirely (the /map list is a
  // reflection of the map, not a ranked pick); open/closed still shows via the
  // variant's PlaceStatus.
  const reasons = neutral ? [] : placeReasons(place);
  // Where the card ALSO renders an explicit open indicator (the tile's
  // status dot, the feature/answer PlaceStatus line), the leading "Open"
  // reason chip just echoes it. Drop it there so the two visible chips
  // carry NEW signal (a walk time, Local favorite) instead of repeating
  // the dot. Row/grid keep the full set — there the chip is the ONLY
  // open signal, so removing it would lose information.
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
          aria-label={`View ${place.name} details`}
          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        >
          <div className="flex items-start gap-3 p-4 pl-5">
            <Thumb noPhoto={noPhoto} place={place} category={place.category} color={color} size={52} />
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
                {place.deal_hook ? <DealHookTag label={place.deal_hook} /> : place.field_notes && !place.field_note_tip ? <FieldNoteTag /> : null}
                {nonOpenReasons.length > 0 ? (
                  <StatusChipRow reasons={nonOpenReasons} />
                ) : (
                  <Rave rating={place.google_rating} count={place.google_rating_count} />
                )}
              </div>
            </div>
          </div>
        </button>
        <div className="absolute right-2.5 top-2.5 z-10">
          <SaveButton refType="place" refId={place.slug} label={`Save ${place.name}`} />
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
          aria-label={`View ${place.name} details`}
          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        >
          <div className="space-y-2.5 p-4">
            <div className="flex items-start gap-3">
              <Thumb noPhoto={noPhoto} place={place} category={place.category} color={color} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
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
              <Rave rating={place.google_rating} count={place.google_rating_count} />
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
            ) : place.review_snippet ? (
              <blockquote
                className="mt-0.5 border-l-2 pl-2.5 text-[13px] italic leading-snug"
                style={{ borderColor: `color-mix(in srgb, ${color} 60%, transparent)`, color: "var(--app-ink-2)" }}
              >
                {/* Clamp to two lines: a supporting quote, not a wall. The
                    full review lives on the place detail page. */}
                <span className="line-clamp-2">&ldquo;{place.review_snippet}&rdquo;</span>
                {place.review_author && (
                  <cite className="mt-0.5 block text-[11px] not-italic" style={{ color: "var(--app-ink-3)" }}>
                    {place.review_author}, Google
                  </cite>
                )}
              </blockquote>
            ) : loved.length > 0 ? (
              <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>Loved for</span>{" "}
                {loved.join(" · ")}
              </p>
            ) : null}
          </div>
        </button>
        <div className="absolute right-2.5 top-2.5 z-10">
          <SaveButton refType="place" refId={place.slug} label={`Save ${place.name}`} />
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
          aria-label={`View ${place.name} details`}
          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        >
          <div className="space-y-2 p-3.5 pb-4">
            <div className="flex items-center gap-2.5">
              <Thumb noPhoto={noPhoto} place={place} category={place.category} color={color} size={40} />
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
            {place.deal_hook ? <DealHookTag label={place.deal_hook} compact /> : place.field_notes ? <FieldNoteTag compact /> : null}
            {nonOpenReasons.length > 0 ? (
              <ReasonChipRow reasons={nonOpenReasons.slice(0, 2)} className="pt-0.5" />
            ) : (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <PlaceStatus status={place.open_status} className="!text-[12px]" />
                <Rave rating={place.google_rating} count={place.google_rating_count} className="!text-[12px]" />
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
          <SaveButton refType="place" refId={place.slug} label={`Save ${place.name}`} />
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
          aria-label={`View ${place.name} details`}
          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        >
          <div className="flex items-start gap-2.5 p-2.5">
            <Thumb noPhoto={noPhoto} place={place} category={place.category} color={color} size={40} />
            <div className="min-w-0 flex-1 space-y-0.5">
              <h3 className="line-clamp-2 text-[14px] font-semibold leading-[1.2] tracking-tight" style={{ color: "var(--app-ink)" }}>
                {place.name}
              </h3>
              <p className="truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                {cat?.name ?? place.category}
                {place.distance_m !== undefined && <> · {formatDistance(place.distance_m)}</>}
              </p>
              {place.deal_hook ? <DealHookTag label={place.deal_hook} compact /> : place.field_notes ? <FieldNoteTag compact /> : null}
              {reasons.length > 0 ? (
                <ReasonChipRow reasons={reasons.slice(0, 2)} className="pt-0.5" />
              ) : (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <PlaceStatus status={place.open_status} className="!text-[11px]" />
                  <Rave rating={place.google_rating} count={place.google_rating_count} className="!text-[11px]" />
                </div>
              )}
            </div>
          </div>
          <div aria-hidden className="h-[2px] w-full" style={{ background: color }} />
        </button>
      </article>
    );
  }

  // ── ROW (default) — the dense list card. Leading category mark, name,
  // type/known-for, distance, and chips. The workhorse of every list.
  // The title leads; a quiet 42px mark anchors the left; chips capped at 2
  // so a long list scans as names, not a wall of pills. Tighter vertical
  // rhythm shortens the page without crowding.
  const rowReasons = reasons.slice(0, 2);
  return (
    <article
      className="tactile tactile-interactive tactile-e2 group relative flex items-stretch gap-3 rounded-[var(--app-radius-lg)] px-3 py-2.5"
      style={{ background: "var(--app-bg-elevated-solid)" }}
    >
      <div className="self-center">
        <Thumb noPhoto={noPhoto} place={place} category={place.category} color={color} size={52} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={openDetail}
            aria-label={`View ${place.name} details`}
            className="line-clamp-2 min-w-0 flex-1 text-left text-[16px] font-semibold leading-[1.18] tracking-tight outline-none focus-visible:underline"
            style={{ color: "var(--app-ink)" }}
          >
            <span className="absolute inset-0" aria-hidden />
            {place.name}
          </button>
          {showSource && <SourceBadge place={place} size="sm" />}
          {place.distance_m !== undefined && (
            <span className="ml-auto mt-[1px] shrink-0 whitespace-nowrap text-[12px] font-medium tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              {formatDistance(place.distance_m)}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          {cat?.name ?? place.category}
          {kf && <> · {kf}</>}
        </p>
        {place.market_day && (
          <p className="mt-0.5 truncate text-[12px] font-medium" style={{ color: "var(--app-brand-press)" }}>
            {place.market_day}{place.market_hours ? ` · ${place.market_hours}` : ""}
          </p>
        )}
        {place.deal_hook ? <DealHookTag label={place.deal_hook} className="mt-1.5" /> : place.field_notes ? <FieldNoteTag className="mt-1.5" /> : null}
        {!compact && (
          rowReasons.length > 0 ? (
            <StatusChipRow reasons={rowReasons} className="mt-1.5" />
          ) : (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <PlaceStatus status={place.open_status} />
              <Rave rating={place.google_rating} count={place.google_rating_count} />
              {place.price_band && (
                <span className="text-[12px] font-medium" style={{ color: "var(--app-ink-3)" }}>
                  {"$".repeat(place.price_band)}
                </span>
              )}
            </div>
          )
        )}
      </div>
      <div className="relative z-10 self-start">
        <SaveButton refType="place" refId={place.slug} label={`Save ${place.name}`} />
      </div>
    </article>
  );
}
