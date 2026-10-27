"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent } from "react";
import PlaceCardPhoto, { PlaceCardPhotoCredit } from "./PlaceCardPhoto";
import { usePlacePhotoData } from "@/components/place/usePlacePhoto";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { PlaceCardData } from "@/lib/loaders/places";
import OpenClosedDot from "./OpenClosedDot";
import { formatDistance } from "@/lib/geo";
import SaveButton from "@/components/saved/SaveButton";
import { usePlaceSheet } from "./PlaceSheetProvider";
import { haptic } from "@/lib/haptics";
import PlaceStatus from "./PlaceStatus";
import { knownFor } from "@/lib/cuisine";
import { ArrowUpRight, Star, NotebookPen, PawPrint } from "lucide-react";
import CategoryIcon from "./CategoryIcon";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { directionsHref } from "@/lib/map/directionsHref";
import SourceBadge from "./SourceBadge";
import discoveryStyles from "./NearbyDiscoveryCard.module.css";
import { nearbyParksPhotoPlan } from "@/lib/nearby-parks-layout";
import FieldNoteTag, { DealHookTag } from "./FieldNoteTag";
import { ReasonChipRow, type ReasonTone } from "@/components/ui/ReasonChip";
import { placeReasons, type PlaceReasonChip } from "@/lib/place-reasons";
import { placeCardPhotoPlan, recordPlaceCardPhotoResult, selectedPlaceCardPhoto, type PlaceCardPhotoResult, type PlaceCardPhotoState } from "@/lib/place-card-photo";

const subscribeReady = () => () => {};

/**
 * PlaceCard — the shared business card across browse and recommendation
 * surfaces. A verified, individually attributable place photo leads when one
 * is available; the category mark is the fallback. The canonical loader has
 * already removed shared, mismatched, or unattributed images.
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
      <span className="text-xs font-normal" translate="no">Google Maps</span>
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
  verified: { color: "var(--app-positive)",  tint: "color-mix(in srgb, var(--app-positive) 14%, transparent)", edge: "color-mix(in srgb, var(--app-positive) 26%, transparent)" },
  free:     { color: "var(--app-positive)", tint: "var(--app-positive-tint-14)", edge: "color-mix(in srgb, var(--app-positive) 26%, transparent)" },
  rated:    { color: "var(--app-accent-press)",   tint: "color-mix(in srgb, var(--app-accent) 20%, transparent)",  edge: "color-mix(in srgb, var(--app-accent) 34%, transparent)" },
  neutral:  { color: "var(--app-ink-2)",    tint: "var(--app-ink-tint-6)",       edge: "var(--app-ink-tint-12)" },
};

function StatusChip({ label, tone = "neutral" }: { label: string; tone?: ReasonTone }) {
  const t = CHIP_TONE[tone];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-semibold leading-none tracking-tight"
      style={{
        // The label follows the current surface; the tone stays in its tint, ring, and dot.
        color: "var(--app-ink)",
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
 * photo when no eligible source is available. The category icon signals
 * type without pretending to be a photograph of the place.
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

export default function PlaceCard({
  place,
  compact = false,
  variant = "row",
  // Default OFF for dense-list variants (row/tile/grid), where a repeated
  // badge becomes "chip soup" down the margin; ON for the prominent
  // answer/feature lead. Override explicitly anywhere it's wanted.
  showSource = variant === "answer" || variant === "feature",
  neutral = false,
  lazyPhoto = false,
  discoverySurface,
  discoveryIntent,
}: {
  place: PlaceCardData;
  compact?: boolean;
  variant?: "row" | "feature" | "tile" | "grid" | "answer" | "discovery";
  /** Hydrate the photo on scroll; set by surfaces that withhold inline
   *  photo URLs from their payload. */
  lazyPhoto?: boolean;
  /** Nearby alone uses a compact address-led layout; other discovery callers keep their existing cards. */
  discoverySurface?: "nearby";
  /** Parks uses only exact bundled imagery and a compact contextual card. */
  discoveryIntent?: "parks";
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
  const photoWidth = variant === "row" ? (compact ? 56 : 88) : variant === "grid" ? 180 : variant === "tile" ? 244 : 360;
  const parksDiscovery = variant === "discovery" && discoverySurface === "nearby" && discoveryIntent === "parks";
  const inlinePlan = parksDiscovery ? nearbyParksPhotoPlan(place.slug, photoWidth) : placeCardPhotoPlan(place, photoWidth);
  // Reviewed owner/landmark images are already available locally. Hydrate
  // only rows with no eligible inline source, keeping the county payload slim
  // and the existing viewport/batch limits intact.
  const { photoData, anchorRef: photoAnchorRef } = usePlacePhotoData(
    place.slug, !parksDiscovery && (variant === "row" || variant === "discovery") && lazyPhoto && inlinePlan.sources.length === 0,
  );
  const photoPlan = !parksDiscovery && photoData ? placeCardPhotoPlan({ ...place, ...photoData }, photoWidth) : inlinePlan;
  const mountedPhotoPlanKey = useRef(photoPlan.key);
  useLayoutEffect(() => { mountedPhotoPlanKey.current = photoPlan.key; }, [photoPlan.key]);
  const [photoState, setPhotoState] = useState<PlaceCardPhotoState | null>(null);
  const photo = selectedPlaceCardPhoto(photoPlan, photoState);
  const photoLoaded = photoState?.planKey === photoPlan.key && photoState.loadedSrc === photo?.src;
  const onPhotoResult = (src: string, result: PlaceCardPhotoResult) => {
    setPhotoState((state) => mountedPhotoPlanKey.current === photoPlan.key
      ? recordPlaceCardPhotoResult(photoPlan, state, src, result)
      : state);
  };
  const interactionReady = useSyncExternalStore(subscribeReady, () => true, () => false);
  const cat = CATEGORY_BY_SLUG[place.category];
  const color = cat?.color ?? "var(--app-brand)";
  const { openSheet } = usePlaceSheet();
  const openDetail = (event: MouseEvent<HTMLButtonElement>) => {
    haptic("light");
    // Safari pointer taps do not reliably focus buttons before opening a sheet.
    openSheet(place, { returnFocus: event.currentTarget });
  };
  // Chain locations often share the same visible name. Give every card action
  // enough location context for voice control and screen readers to distinguish
  // the downtown result from the one across the county.
  const actionName = place.address
    ? `${place.name} at ${place.address}`
    : place.city
      ? `${place.name} in ${place.city}`
      : place.name;
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

  // Nearby discovery gives an exact place photograph enough room to identify
  // the destination. A missing/exhausted plan keeps a compact, factual card.
  if (variant === "discovery") {
    const nearby = discoverySurface === "nearby";
    const credit = <PlaceCardPhotoCredit source={photo} loaded={photoLoaded} touchTarget compact discloseModifications={parksDiscovery} />;
    const town = MUNICIPALITY_BY_SLUG[place.municipality]?.name ?? place.city;
    // A decorative initial distinguishes no-photo results without presenting a
    // graphic as the business's logo or asserting anything about its appearance.
    const initial = place.name.match(/[\p{L}\p{N}]/u)?.[0]?.toLocaleUpperCase("en-US") ?? "";
    const repeatedFacts = new Set([place.name, cat?.name, place.category, town, "Hours not confirmed"]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().toLocaleLowerCase()));
    const fact = [place.field_note_tip, place.known_for?.[0], kf]
      .find((value) => value?.trim() && !repeatedFacts.has(value.trim().toLocaleLowerCase()));
    const hoursUnknown = place.open_status.state === "unknown" || place.open_status.state === "unverified";
    // The server and first hydration render use the same functioning directions
    // URL. Once interactive, the shared helper selects the device's native map.
    const directions = interactionReady
      ? directionsHref(place.geom.lat, place.geom.lng)
      : `https://www.google.com/maps/dir/?api=1&destination=${place.geom.lat},${place.geom.lng}`;
    return (
      <article
        ref={photoAnchorRef}
        data-place-card-variant="discovery"
        data-place-card-surface={discoverySurface}
        data-place-card-slug={place.slug}
        data-nearby-parks-card={parksDiscovery || undefined}
        data-place-card-photo-ready={parksDiscovery ? photoLoaded : undefined}
        data-place-card-has-photo={photo ? "true" : "false"}
        className={nearby ? `${discoveryStyles.card} ${parksDiscovery ? discoveryStyles.parksCard : ""}` : "relative mx-auto w-full min-w-0 max-w-[600px] overflow-hidden rounded-[var(--app-radius-xl)] border bg-[var(--app-bg-elevated-solid)]"}
        style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1)" }}
      >
        <button
          type="button"
          data-press-target="card"
          onClick={openDetail}
          aria-label={`View ${actionName} details`}
          className="group block w-full min-w-0 text-left"
        >
          <span data-press-face className="block">
          {photo && <PlaceCardPhoto source={photo} onResult={onPhotoResult} width={360}
            sizes={parksDiscovery ? "auto, (max-width: 640px) calc(100vw - 32px), 600px" : "(max-width: 640px) calc(100vw - 32px), 600px"}
            deferGoogleBytes={!parksDiscovery && lazyPhoto} />}
          {nearby ? <div className={`${discoveryStyles.body} ${photo ? "" : discoveryStyles.withoutPhoto} ${!photo && !parksDiscovery ? discoveryStyles.illustrated : ""}`}>
            {!photo && (parksDiscovery ? <CategoryMark category={place.category} color="var(--app-ink-2)" size={36} />
              : <span aria-hidden="true" data-nearby-category-art className={discoveryStyles.categoryArt}
                style={{ "--nearby-category-color": color } as CSSProperties}>
                <span data-nearby-art-initial className={discoveryStyles.categoryInitial}>{initial}</span>
                <CategoryIcon slug={place.category} className={discoveryStyles.categoryArtIcon} strokeWidth={1.65} />
              </span>)}
            <div className={discoveryStyles.copy}>
              <h3 className={discoveryStyles.title}>{place.name}</h3>
              {!parksDiscovery && <p className={discoveryStyles.eyebrow}>
                <span>{cat?.name ?? place.category}</span>
                {town && <><span aria-hidden>·</span><span>{town}</span></>}
              </p>}
              {parksDiscovery ? town && <p className={discoveryStyles.parkTown}>{town}</p>
                : place.address && <p className={discoveryStyles.address}>{place.address}</p>}
              {(!parksDiscovery || !hoursUnknown || place.distance_m !== undefined) && <div className={discoveryStyles.facts}>
                {parksDiscovery ? <PlaceStatus status={place.open_status} /> : hoursUnknown ? <span>Hours not confirmed</span> : <PlaceStatus status={place.open_status} />}
                {place.distance_m !== undefined && <span className={discoveryStyles.distance}>{formatDistance(place.distance_m)}</span>}
              </div>}
              {!parksDiscovery && photo && fact && <p className={discoveryStyles.note}>{fact}</p>}
            </div>
          </div> : <div className={photo ? "p-4" : "flex items-start gap-3 p-3"}>
            {!photo && <CategoryMark category={place.category} color="var(--app-ink-2)" size={44} />}
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] leading-normal" style={{ color: "var(--app-ink-2)" }}>
                <span>{cat?.name ?? place.category}</span>
                {town && <><span aria-hidden>·</span><span>{town}</span></>}
                {place.distance_m !== undefined && <><span aria-hidden>·</span><span className="tabular-nums">{formatDistance(place.distance_m)}</span></>}
              </p>
              <h3 className={`mt-1 break-words font-semibold leading-[1.15] tracking-[-0.035em] [overflow-wrap:anywhere] ${photo ? "text-[24px]" : "text-[20px]"}`} style={{ color: "var(--app-ink)" }}>
                {place.name}
              </h3>
              <div className="mt-2 text-[13px] leading-normal" style={{ color: "var(--app-ink-2)" }}>
                {hoursUnknown ? <span>Hours not confirmed</span> : <PlaceStatus status={place.open_status} className="!text-[13px] !text-[var(--app-ink-2)]" />}
              </div>
              {photo && fact && <p className="mt-2 line-clamp-2 text-[14px] leading-[1.45]" style={{ color: "var(--app-ink-2)" }}>{fact}</p>}
            </div>
          </div>}
          </span>
        </button>
        {!parksDiscovery && credit}
        <div className={nearby ? `${discoveryStyles.actions} ${parksDiscovery ? discoveryStyles.parksActions : ""}` : "grid grid-cols-2 gap-2 px-4 pb-4 [&_button]:flex-row [&_button]:gap-2 [&_button]:border [&_button]:border-[var(--app-control-border)] [&_button]:text-[13px]"}>
          <SaveButton refType="place" refId={place.slug} label={`Save ${actionName}`} barLabel={parksDiscovery ? undefined : "Save"} />
          <a
            href={directions}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Directions to ${actionName}`}
            data-press-target={nearby ? "secondary" : undefined}
            className="flex min-h-[52px] min-w-0 items-center justify-center gap-2 rounded-[var(--app-radius-md)] border px-2 py-2 text-[13px] font-semibold leading-snug outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"
            style={{ borderColor: nearby ? "var(--app-brand)" : "var(--app-control-border)", color: nearby ? "var(--app-on-brand)" : "var(--app-link)" }}
          >
            <span data-press-face={nearby ? "" : undefined} className="inline-flex items-center justify-center gap-2">
              Directions
              {!parksDiscovery && <ArrowUpRight className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden />}
            </span>
          </a>
        </div>
        {parksDiscovery && credit}
      </article>
    );
  }

  // ── FEATURE — the prominent promoted lead (Today "Worth a look", a
  // category page lead). An exact place photo leads when available; the
  // category mark keeps its real facts usable when every source fails.
  if (variant === "feature") {
    return (
      <article
        className="tactile relative overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)]"
        style={{ boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
      >
        <div aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
        <button
          type="button"
          data-press-target="card"
          onClick={openDetail}
          aria-label={`View ${actionName} details`}
          className="group block min-h-11 w-full text-left"
        >
          <span data-press-face className="block">
          <PlaceCardPhoto source={photo} onResult={onPhotoResult} />
          <div className="flex items-start gap-3 p-4 pl-5">
            {!photo && <CategoryMark category={place.category} color={color} size={46} />}
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
          </span>
        </button>
        <PlaceCardPhotoCredit source={photo} loaded={photoLoaded} />
        <div className="absolute right-2.5 top-2.5 z-10">
          <SaveButton refType="place" refId={place.slug} label={`Save ${actionName}`} />
        </div>
      </article>
    );
  }

  // ── ANSWER — the funnel's lead pick. Keeps the full honest signal block
  // (open + closing time, why-chips, rating, price, the attributed review
  // snippet), headed by an exact place photo or the category mark.
  if (variant === "answer") {
    const loved = (place.customers_loved ?? []).slice(0, 3);
    return (
      <article
        className="tactile tactile-e3 relative overflow-hidden rounded-[var(--app-radius-lg)]"
        style={{
          backgroundColor: "var(--app-bg-elevated-solid)",
          backgroundImage: "var(--app-paper-light)",
        }}
      >
        <div aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: color }} />
        <button
          type="button"
          data-press-target="card"
          onClick={openDetail}
          aria-label={`View ${actionName} details`}
          className="group block min-h-11 w-full text-left"
        >
          <span data-press-face className="block">
          <PlaceCardPhoto source={photo} onResult={onPhotoResult} />
          <div className="space-y-2.5 p-4">
            <div className="flex items-start gap-3">
              {!photo && <CategoryMark category={place.category} color={color} size={46} />}
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
            ) : loved.length > 0 ? (
              <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>Loved for</span>{" "}
                {loved.join(" · ")}
              </p>
            ) : null}
          </div>
          </span>
        </button>
        <PlaceCardPhotoCredit source={photo} loaded={photoLoaded} />
        <div className="absolute right-2.5 top-2.5 z-10">
          <SaveButton refType="place" refId={place.slug} label={`Save ${actionName}`} />
        </div>
      </article>
    );
  }

  // ── TILE — fixed-width card for horizontal shelves. The photo and its
  // sibling credit keep the source links separate from opening and saving.
  if (variant === "tile") {
    return (
      <article
        className="tactile relative w-[244px] shrink-0 overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]"
        style={{
          borderColor: "var(--app-border)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        <button
          type="button"
          data-press-target="card"
          onClick={openDetail}
          aria-label={`View ${actionName} details`}
          className="group block min-h-11 w-full text-left"
        >
          <span data-press-face className="block">
          <PlaceCardPhoto source={photo} onResult={onPhotoResult} width={244} />
          <div className="space-y-2 p-3.5 pb-4">
            <div className={`flex items-center gap-2.5${!photo ? " pr-9" : ""}`}>
              {!photo && <CategoryMark category={place.category} color={color} size={40} />}
              <span className="truncate text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink)" }}>
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
          </span>
        </button>
        <PlaceCardPhotoCredit source={photo} loaded={photoLoaded} />
        {showSource && (
          <div className="absolute left-2 top-2 z-10">
            <SourceBadge place={place} size="sm" />
          </div>
        )}
        <div className="absolute right-2 top-2 z-10">
          <SaveButton refType="place" refId={place.slug} label={`Save ${actionName}`} />
        </div>
      </article>
    );
  }

  // ── GRID — compact responsive cell. Leading category mark, tight text,
  // chips. ~a third the footprint of a tile.
  if (variant === "grid") {
    return (
      <article className="tactile relative overflow-hidden rounded-[var(--app-radius-md)] bg-[var(--app-bg-elevated)]">
        <button
          type="button"
          data-press-target="card"
          onClick={openDetail}
          aria-label={`View ${actionName} details`}
          className="group block min-h-11 w-full text-left"
        >
          <span data-press-face className="block">
          <PlaceCardPhoto source={photo} onResult={onPhotoResult} width={180} />
          <div className="flex items-start gap-2.5 p-2.5">
            {!photo && <CategoryMark category={place.category} color={color} size={40} />}
            <div className="min-w-0 flex-1 space-y-0.5">
              <h3 className="line-clamp-2 text-[15px] font-semibold leading-[1.2] tracking-tight" style={{ color: "var(--app-ink)" }}>
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
          </span>
        </button>
        <PlaceCardPhotoCredit source={photo} loaded={photoLoaded} />
      </article>
    );
  }

  // ── ROW — exact photography, a readable name, and one useful facts line.
  // Keep source links outside the detail action and cap reason chips at two.
  const rowReasons = reasons.slice(0, 2);
  const inlineTag = place.deal_hook ? (
    <DealHookTag label={place.deal_hook} compact />
  ) : place.field_notes ? (
    <FieldNoteTag compact />
  ) : null;
  return (
    <article
      className="tactile tactile-e2 relative overflow-hidden rounded-[var(--app-radius-lg)]"
      style={{
        backgroundColor: "var(--app-bg-elevated-solid)",
        backgroundImage: "var(--app-paper-light)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[3px]"
        style={{ background: color }}
      />
      <button
        type="button"
        data-press-target="card"
        onClick={openDetail}
        aria-label={`View ${actionName} details`}
        className="absolute inset-0 z-0 rounded-[var(--app-radius-lg)] text-left"
      >
        <span data-press-face="outline" aria-hidden />
      </button>
      <div className="flex items-stretch gap-3 p-3 pl-3.5">
        <div ref={photoAnchorRef} className="pointer-events-none relative z-10 shrink-0 self-center">
          {photo ? (
            <PlaceCardPhoto source={photo} onResult={onPhotoResult} width={photoWidth} frame={compact ? "compact-row" : "row"} deferGoogleBytes={lazyPhoto} />
          ) : <CategoryMark category={place.category} color={color} size={compact ? 40 : 46} />}
        </div>
        <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col justify-center">
          <div className="flex items-start gap-2">
            <h3
              className="line-clamp-2 min-w-0 flex-1 text-[15px] font-semibold leading-[1.3] tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              {place.name}
            </h3>
            {showSource && <SourceBadge place={place} size="sm" />}
            {place.distance_m !== undefined && (
              <span className="ml-auto mt-[1px] shrink-0 whitespace-nowrap text-[12px] font-medium tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                {formatDistance(place.distance_m)}
              </span>
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-[12.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            {(place.tags ?? []).includes("dog-friendly") && (
              <PawPrint
                className="h-3 w-3 shrink-0"
                strokeWidth={2.25}
                style={{ color: "var(--app-brand-2)" }}
                aria-label="Dog-friendly"
              />
            )}
            <span className="truncate">
              {cat?.name ?? place.category}
              {kf && <> · {kf}</>}
            </span>
          </p>
          {place.market_day && (
            <p className="mt-0.5 truncate text-[12px] font-medium" style={{ color: "var(--app-brand-press)" }}>
              {place.market_day}{place.market_hours ? ` · ${place.market_hours}` : ""}
            </p>
          )}
          {!compact && (
            rowReasons.length > 0 ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <StatusChipRow reasons={rowReasons} />
                {inlineTag}
              </div>
            ) : (
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <PlaceStatus status={place.open_status} />
                <Rave rating={place.google_rating} count={place.google_rating_count} />
                {place.price_band && (
                  <span className="text-[12px] font-medium" style={{ color: "var(--app-ink-3)" }}>
                    {"$".repeat(place.price_band)}
                  </span>
                )}
                {inlineTag}
              </div>
            )
          )}
        </div>
        <div className="relative z-10 self-start">
          <SaveButton refType="place" refId={place.slug} label={`Save ${actionName}`} />
        </div>
      </div>
      <div className="relative z-10">
        <PlaceCardPhotoCredit source={photo} loaded={photoLoaded} compact />
      </div>
    </article>
  );
}
