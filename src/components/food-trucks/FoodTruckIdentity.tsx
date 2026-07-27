import Image from "next/image";
import type { CSSProperties } from "react";
import type { FoodTruck } from "@/data/food-trucks";
import FOOD_TRUCK_MARKS from "@/data/food-truck-marks.json";
import {
  foodTruckInitials,
  foodTruckVisualTone,
} from "@/lib/food-trucks/presentation";

export type FoodTruckIdentitySize = "thumb" | "card" | "hero" | "detail";

type FoodTruckIdentityProps = {
  truck: Pick<FoodTruck, "slug" | "name" | "cuisine" | "kind" | "media">;
  size?: FoodTruckIdentitySize;
  priority?: boolean;
  /** Use when the same card or drawer names the vendor immediately afterward. */
  decorative?: boolean;
};

/**
 * A vendor's real visual identity, with an honest designed fallback.
 *
 * The public marks come from the vendor-controlled pages recorded in
 * food-truck-marks.json. Website photo candidates never enter this component
 * until the roster records display permission.
 */
export default function FoodTruckIdentity({
  truck,
  size = "card",
  priority = false,
  decorative = false,
}: FoodTruckIdentityProps) {
  if (truck.media) {
    return (
      <div
        className="food-truck-vendor-visual relative overflow-hidden"
        data-kind={truck.kind}
        data-photo-state="verified"
        data-size={size}
      >
        <Image
          src={truck.media.src}
          alt={decorative ? "" : truck.media.alt}
          fill
          priority={priority}
          sizes={
            size === "detail"
              ? "(max-width: 640px) 100vw, 560px"
              : size === "hero"
                ? "(max-width: 640px) 45vw, 260px"
                : size === "thumb"
                  ? "112px"
                  : "(max-width: 640px) 50vw, 260px"
          }
          className="object-cover"
        />
        {size === "detail" && truck.media.sourceUrl ? (
          <a
            href={truck.media.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="food-truck-media-credit"
            aria-label={`Photo credit: ${truck.media.credit}`}
          >
            {truck.media.credit}
          </a>
        ) : (
          <span
            className="food-truck-media-credit"
            aria-hidden={decorative || undefined}
          >
            {truck.media.credit}
          </span>
        )}
      </div>
    );
  }

  const mark =
    FOOD_TRUCK_MARKS[truck.slug as keyof typeof FOOD_TRUCK_MARKS];
  const visualStyle = {
    "--truck-tone": foodTruckVisualTone(truck.slug),
  } as CSSProperties;

  if (mark) {
    return (
      <div
        className="food-truck-vendor-visual food-truck-mark-visual"
        data-kind={truck.kind}
        data-photo-state="official-mark"
        data-size={size}
        style={visualStyle}
        aria-hidden={decorative || undefined}
      >
        <span className="food-truck-mark-kicker">
          {size === "hero" ? "Local vendor" : "Frederick County vendor"}
        </span>
        <span className="food-truck-mark-plate" data-plate={mark.plate}>
          <Image
            src={mark.file}
            alt={decorative ? "" : `${truck.name} logo`}
            fill
            priority={priority}
            sizes={
              size === "detail"
                ? "280px"
                : size === "hero"
                  ? "180px"
                  : size === "thumb"
                    ? "84px"
                    : "180px"
            }
            className="object-contain"
          />
        </span>
        {/* The cuisine belongs to whichever element is the label. When a card
            or drawer names the vendor immediately afterward it prints the
            cuisine too, so printing it here as well stamped every roster card
            with "Barbecue / Barbecue / Blues BBQ". */}
        {decorative ? null : <span className="food-truck-mark-cuisine">{truck.cuisine}</span>}
        {size === "detail" && !decorative ? (
          <a
            href={mark.sourcePage}
            target="_blank"
            rel="noopener noreferrer"
            className="food-truck-media-credit"
            aria-label={`${truck.name} official logo source`}
          >
            Logo source
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="food-truck-vendor-visual food-truck-vendor-fallback"
      data-kind={truck.kind}
      data-photo-state="fallback"
      data-size={size}
      style={visualStyle}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={
        decorative
          ? undefined
          : `${truck.name} branded placeholder. An approved vendor photo has not been added yet.`
      }
    >
      <span className="food-truck-fallback-kicker">Frederick County</span>
      <strong className="food-truck-vendor-mark">{foodTruckInitials(truck.name)}</strong>
      <span className="food-truck-fallback-rule" aria-hidden />
      {/* Same reason as the mark variant above: the labelling card prints the
          cuisine, so repeating it here read as a stutter on every card. */}
      {decorative ? null : <span className="food-truck-vendor-cuisine">{truck.cuisine}</span>}
      <span className="food-truck-fallback-footer">Mobile vendor</span>
    </div>
  );
}
