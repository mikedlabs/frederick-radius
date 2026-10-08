"use client";

import Image from "next/image";
import { useState, type SyntheticEvent } from "react";
import { Truck } from "lucide-react";
import type { FoodTruck } from "@/data/food-trucks";
import FOOD_TRUCK_MARKS from "@/data/food-truck-marks.json";

export type FoodTruckIdentitySize = "thumb" | "card" | "hero" | "detail";

/**
 * Painted size of the square in CSS pixels. A stop row uses the 48px thumb;
 * every other surface uses 64px. The masthead lineup may grow its tiles on
 * wide screens through CSS, which is why `hero` is sized there rather than
 * inline.
 */
export const FOOD_TRUCK_IDENTITY_PX: Record<FoodTruckIdentitySize, number> = {
  thumb: 48,
  card: 64,
  hero: 64,
  detail: 64,
};

type FoodTruckIdentityProps = {
  truck: Pick<FoodTruck, "slug" | "name" | "cuisine" | "kind" | "media">;
  size?: FoodTruckIdentitySize;
  priority?: boolean;
  /** Use when the same card or drawer names the vendor immediately afterward. */
  decorative?: boolean;
};

type FoodTruckMark = {
  file: string;
  sourcePage: string;
  plate: string;
};

/** A decode with no pixels is a broken or empty file, not a logo. */
function decodedEmpty(event: SyntheticEvent<HTMLImageElement>): boolean {
  const image = event.currentTarget;
  return image.naturalWidth <= 1 || image.naturalHeight <= 1;
}

/**
 * A vendor's real visual identity, or an honest mark when Radius has none.
 *
 * The ladder:
 * - a roster photo, only when the roster records display permission, shown
 *   in the square with its credit after it loads (detail size only);
 * - the vendor's own logo from food-truck-marks.json, fetched from a page the
 *   vendor controls, contained in the square on Cream. A logo published as
 *   light artwork for a dark ground (`plate: "dark"`) sits on Ink instead,
 *   because the vendor drew it for that ground;
 * - otherwise the Truck mark: a flat Brick tint with a Brick-press glyph.
 *
 * A logo or photo that fails to load, or decodes empty, falls back to the
 * mark. There are no initials, halftones, rings or caption caps: a mark must
 * never pose as a picture of the business.
 */
export default function FoodTruckIdentity({
  truck,
  size = "card",
  priority = false,
  decorative = false,
}: FoodTruckIdentityProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const px = FOOD_TRUCK_IDENTITY_PX[size];
  const sizes = size === "hero" ? "(max-width: 480px) 64px, 120px" : `${px}px`;
  const mark = (FOOD_TRUCK_MARKS as Record<string, FoodTruckMark>)[truck.slug];

  const media = truck.media && failed !== truck.media.src ? truck.media : null;
  if (media) {
    const showCredit = size === "detail" && loaded === media.src;
    const frame = (
      <span
        className="food-truck-identity"
        data-kind={truck.kind}
        data-photo-state="verified"
        data-size={size}
      >
        <Image
          src={media.src}
          alt={decorative ? "" : media.alt}
          fill
          priority={priority}
          sizes={sizes}
          className="object-cover"
          onLoad={(event) => {
            if (decodedEmpty(event)) setFailed(media.src);
            else setLoaded(media.src);
          }}
          onError={() => setFailed(media.src)}
        />
      </span>
    );
    if (size !== "detail") return frame;
    return (
      <figure className="food-truck-identity-figure">
        {frame}
        {showCredit ? (
          <figcaption className="text-caption" style={{ color: "var(--app-ink-3)" }}>
            {media.sourceUrl ? (
              <a href={media.sourceUrl} target="_blank" rel="noopener noreferrer" className="tap-44-y inline-flex items-center underline">
                Photo: {media.credit}
              </a>
            ) : (
              <>Photo: {media.credit}</>
            )}
          </figcaption>
        ) : null}
      </figure>
    );
  }

  if (mark && failed !== mark.file) {
    const frame = (
      <span
        className="food-truck-identity"
        data-kind={truck.kind}
        data-photo-state="official-mark"
        data-plate={mark.plate === "dark" ? "dark" : "light"}
        data-size={size}
        aria-hidden={decorative || undefined}
      >
        <span className="food-truck-identity-art">
          <Image
            src={mark.file}
            alt={decorative ? "" : `${truck.name} logo`}
            fill
            priority={priority}
            sizes={sizes}
            className="object-contain"
            onLoad={(event) => {
              if (decodedEmpty(event)) setFailed(mark.file);
            }}
            onError={() => setFailed(mark.file)}
          />
        </span>
      </span>
    );
    if (size !== "detail" || decorative) return frame;
    return (
      <figure className="food-truck-identity-figure">
        {frame}
        <figcaption className="text-caption">
          <a
            href={mark.sourcePage}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-44-y inline-flex items-center underline"
            style={{ color: "var(--app-ink-3)" }}
            aria-label={`${truck.name} official logo source`}
          >
            Logo source
          </a>
        </figcaption>
      </figure>
    );
  }

  return (
    <span
      className="food-truck-identity"
      data-kind={truck.kind}
      data-photo-state="fallback"
      data-size={size}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `${truck.name} has no logo on file yet.`}
    >
      <Truck className="food-truck-identity-glyph" aria-hidden />
    </span>
  );
}
