"use client";

import { useLayoutEffect, useRef, useState } from "react";
import CompactPlacePhoto from "./CompactPlacePhoto";
import { getOwnedPlacePhoto } from "@/lib/owned-place-photos";
import type { PlaceCardPhotoResult } from "@/lib/place-card-photo";
import CategoryIcon from "@/components/place/CategoryIcon";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { proxyPhotoAtWidth } from "@/lib/format/img";
import type { PlaceCardData } from "@/lib/loaders/places";
import { hasTodayPhotoAppearanceReview } from "@/lib/today/place-photo-appearance";

type PlaceMedallionPlace = Pick<
  PlaceCardData,
  "slug" | "name" | "category" | "google_photo_url"
>;

type PlaceMedallionProps = {
  place: PlaceMedallionPlace;
  size?: number;
  shape?: "circle" | "rounded";
  surface?: "paper" | "inverse";
  className?: string;
  /** Today decision rows cannot treat identity/rights as current appearance. */
  requireCurrentAppearance?: boolean;
  appearanceAsOf?: Date;
};

/**
 * Compact portraits have their own honest fallback already: the place's
 * category mark. Ask the photo proxy for its transparent 1px failure signal
 * instead of the text-heavy artwork intended for hero images. The category
 * mark remains underneath the photo, so a failed request reveals a deliberate
 * branded medallion rather than a cropped "PHOTO NOT AVAILABLE" plate.
 */
export function medallionPhotoSrc(src: string, size: number): string {
  const narrowed = proxyPhotoAtWidth(src, size);
  if (!narrowed.startsWith("/api/place-photo")) return narrowed;
  const url = new URL(narrowed, "https://frederickradius.local");
  url.searchParams.set("fallback", "signal");
  return `${url.pathname}?${url.searchParams.toString()}`;
}

/**
 * A compact, decorative place portrait for dense rows and wallet lockups.
 * Approved place photos lead when present; the category mark is the honest
 * fallback. The adjacent place name carries the accessible label.
 */
export function PlaceMedallion({
  place,
  size = 40,
  shape = "rounded",
  surface = "paper",
  className = "",
  requireCurrentAppearance = false,
  appearanceAsOf,
}: PlaceMedallionProps) {
  const categoryColor =
    CATEGORY_BY_SLUG[place.category]?.color ?? "var(--app-brand)";
  const inverse = surface === "inverse";
  // A medallion is often inside a navigation link and has no independent
  // credit surface. Reuse exact owned images here; licensed alternatives stay
  // on cards/sheets that can display their full source and license links.
  const owned = getOwnedPlacePhoto(place.slug);
  const sources = [owned?.src, place.google_photo_url ? medallionPhotoSrc(place.google_photo_url, size) : undefined]
    .filter((src, index, all): src is string => Boolean(src) && all.indexOf(src) === index)
    .filter(src => !requireCurrentAppearance || hasTodayPhotoAppearanceReview(place.slug, src, undefined, appearanceAsOf));
  const planKey = JSON.stringify([place.slug, sources]);
  const currentPlan = useRef(planKey);
  useLayoutEffect(() => { currentPlan.current = planKey; }, [planKey]);
  const [state, setState] = useState<{ key: string; failed: string[]; loaded: string | null } | null>(null);
  const failures = state?.key === planKey ? state.failed : [];
  const photoSrc = sources.find((src) => !failures.includes(src)) ?? null;
  const photoLoaded = state?.key === planKey && state.loaded === photoSrc;
  const onResult = (src: string, result: PlaceCardPhotoResult) => {
    setState((previous) => {
      if (currentPlan.current !== planKey) return previous;
      const value = previous?.key === planKey ? previous : { key: planKey, failed: [], loaded: null };
      if (sources.find((candidate) => !value.failed.includes(candidate)) !== src) return previous;
      return result === "loaded" ? { ...value, loaded: src }
        : { ...value, failed: [...value.failed, src], loaded: null };
    });
  };

  return (
    <span
      aria-hidden
      data-place-media={photoSrc ? "photo" : "fallback"}
      data-photo-state={photoSrc ? photoLoaded ? "ready" : "pending" : "fallback"}
      data-place-photo-source={photoSrc === owned?.src ? "owned" : photoSrc ? "supplied" : undefined}
      data-place-slug={place.slug}
      className={`relative grid shrink-0 place-items-center overflow-hidden ${
        shape === "circle"
          ? "rounded-full"
          : "rounded-[var(--app-radius-sm)]"
      } ${className}`.trim()}
      style={{
        width: size,
        height: size,
        color: inverse ? "var(--app-ink-inverse)" : categoryColor,
        background: inverse
          ? "rgba(255,255,255,.12)"
          : `color-mix(in srgb, ${categoryColor} 11%, var(--app-bg-elevated-solid))`,
        boxShadow: inverse
          ? "inset 0 0 0 1px rgba(255,255,255,.28), 0 2px 8px rgba(0,0,0,.22)"
          : `inset 0 0 0 1px color-mix(in srgb, ${categoryColor} 20%, transparent), var(--app-edge)`,
      }}
    >
      <CategoryIcon
        slug={place.category}
        strokeWidth={1.9}
        style={{
          color: inverse ? "currentColor" : categoryColor,
          width: Math.round(size * 0.44),
          height: Math.round(size * 0.44),
        }}
      />
      {photoSrc ? (
        <CompactPlacePhoto src={photoSrc} size={size} onResult={onResult}
          objectPosition={photoSrc === owned?.src ? owned?.objectPosition : undefined} />
      ) : null}
    </span>
  );
}
