"use client";

import Image from "next/image";
import { useState } from "react";
import type { PlaceCardData } from "@/lib/loaders/places";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { proxyPhotoAtWidth } from "@/lib/format/img";
import { GooglePhotoAttributionLine } from "./GoogleAttribution";

/** A photograph of the selected place, supplied by the canonical loader.
 * A missing or failed photo leaves the card's real name and facts intact. */
export default function PlaceCardPhoto({ place, width = 360 }: { place: PlaceCardData; width?: number }) {
  const rawSrc = place.google_photo_url;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!rawSrc || failedSrc === rawSrc) return null;
  let src = proxyPhotoAtWidth(rawSrc, width);
  if (src.startsWith("/api/place-photo")) {
    const url = new URL(src, "https://frederickradius.local");
    url.searchParams.set("fallback", "signal");
    src = `${url.pathname}?${url.searchParams.toString()}`;
  }
  return (
    <span
      data-place-card-photo
      className="relative block aspect-[16/9] w-full overflow-hidden bg-[var(--app-bg-sunken)]"
    >
      <Image
        src={src}
        alt=""
        fill
        sizes={width === 180 ? "(max-width: 640px) 50vw, 180px" : `${width}px`}
        unoptimized={src.startsWith("/api/place-photo")}
        placeholder="blur"
        blurDataURL={PAPER_CREAM_BLUR}
        className="object-cover"
        onLoad={(event) => {
          if (event.currentTarget.naturalWidth <= 1 || event.currentTarget.naturalHeight <= 1) {
            setFailedSrc(rawSrc);
          }
        }}
        onError={() => setFailedSrc(rawSrc)}
      />
    </span>
  );
}

/** Keep source links outside the card's open button, avoiding nested actions. */
export function PlaceCardPhotoCredit({ place }: { place: PlaceCardData }) {
  if (!place.google_photo_url?.startsWith("/api/place-photo")) return null;
  return (
    <div className="place-card-photo-credit border-t px-3 py-1" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
      <GooglePhotoAttributionLine
        attribution={place.google_photo_attribution}
        placeGoogleMapsUri={place.google_maps_uri}
        compact
        touchTarget
      />
    </div>
  );
}
