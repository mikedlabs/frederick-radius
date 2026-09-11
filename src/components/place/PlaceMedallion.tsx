import Image from "next/image";
import CategoryIcon from "@/components/place/CategoryIcon";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { proxyPhotoAtWidth } from "@/lib/format/img";
import type { PlaceCardData } from "@/lib/loaders/places";

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
}: PlaceMedallionProps) {
  const categoryColor =
    CATEGORY_BY_SLUG[place.category]?.color ?? "var(--app-brand)";
  const inverse = surface === "inverse";
  const photo = place.google_photo_url;
  const photoSrc = photo ? medallionPhotoSrc(photo, size) : null;

  return (
    <span
      aria-hidden
      data-place-media={photo ? "photo" : "fallback"}
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
        <Image
          // Proxy responses are unoptimized (Next cannot resize an opaque
          // route), so `sizes` alone would still pull the stored 800px hero
          // down to paint a 40px circle. Ask the proxy for the real size.
          src={photoSrc}
          alt=""
          fill
          loading="lazy"
          sizes={`${size}px`}
          unoptimized={photoSrc.startsWith("/api/place-photo")}
          className="object-cover"
        />
      ) : null}
    </span>
  );
}
