"use client";

import { useState } from "react";
import Image from "next/image";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import PhotoLightbox from "@/components/ui/PhotoLightbox";
import { GooglePhotoAttributionLine } from "@/components/place/GoogleAttribution";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";

function photoNameFromProxy(url: string): string | undefined {
  try {
    return new URL(url, "https://frederickradius.app").searchParams.get("name") ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * PlacePhotoGallery — the full place page's "Photos" rail, made tappable.
 *
 * Same shelf-rail of thumbs as before, but each opens the shared
 * full-screen PhotoLightbox (the place sheet already uses it), so photos
 * zoom everywhere — not just in the bottom sheet. The lightbox spans the
 * whole photo set (hero first); the rail shows photos[1..7] since the hero
 * already leads the page. Self-hides when there's nothing extra to show.
 */
export default function PlacePhotoGallery({
  photos,
  name,
  attributions = [],
  placeGoogleMapsUri,
}: {
  photos: string[];
  name: string;
  attributions?: GooglePhotoAttribution[];
  placeGoogleMapsUri?: string;
}) {
  const [at, setAt] = useState<number | null>(null);
  if (!photos || photos.length < 2) return null;

  return (
    <section className="space-y-2">
      <h2 className="eyebrow">Photos</h2>
      <div className="shelf-rail -mx-1 gap-2 px-1 pb-1">
        {photos.slice(1, 8).map((url, i) => {
          const photoName = photoNameFromProxy(url);
          const attribution = attributions.find((credit) => credit.photo_name === photoName);
          return (
            <div key={url} className="w-40 shrink-0 space-y-1">
              <button
                type="button"
                onClick={() => setAt(i + 1)}
                aria-label={`View ${name} photo ${i + 2}`}
                className="relative h-28 w-40 cursor-zoom-in overflow-hidden rounded-[var(--app-radius-md)] border transition active:scale-[0.98]"
                style={{ borderColor: "var(--app-border)" }}
              >
                <Image
                  src={url}
                  alt=""
                  fill
                  unoptimized={url.startsWith("/api/place-photo")}
                  loading="lazy"
                  sizes="160px"
                  placeholder="blur"
                  blurDataURL={PAPER_CREAM_BLUR}
                  className="object-cover"
                />
              </button>
              <span className="block truncate px-0.5" style={{ color: "var(--app-ink-3)" }}>
                <GooglePhotoAttributionLine
                  attribution={attribution}
                  placeGoogleMapsUri={placeGoogleMapsUri}
                  compact
                />
              </span>
            </div>
          );
        })}
      </div>
      {at !== null && (
        <PhotoLightbox photos={photos} startIndex={at} alt={name} onClose={() => setAt(null)} />
      )}
    </section>
  );
}
