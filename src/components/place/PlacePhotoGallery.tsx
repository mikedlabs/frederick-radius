"use client";

import { useState } from "react";
import Image from "next/image";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import PhotoLightbox from "@/components/ui/PhotoLightbox";
import {
  GooglePhotoAttributionLine,
  googlePhotoAttributionForUrl,
} from "@/components/place/GoogleAttribution";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
import {
  isPlacePhotoFailureSignal,
  placePhotoFailureSignalSrc,
} from "@/components/place/PlaceHeroMedia";

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
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const availablePhotos = photos.filter((url) => !failedUrls.has(url));
  const selectedIndex = selectedPhotoIndex(availablePhotos, selectedUrl);
  if (!photos || availablePhotos.length < 2) return null;

  const markFailed = (url: string) => {
    setFailedUrls((current) => {
      if (current.has(url)) return current;
      const next = new Set(current);
      next.add(url);
      return next;
    });
  };

  return (
    <section className="space-y-2">
      <h2 className="eyebrow">Photos</h2>
      <div className="shelf-rail -mx-1 gap-2 px-1 pb-1">
        {availablePhotos.slice(1, 8).map((url, i) => {
          const attribution = googlePhotoAttributionForUrl(url, attributions);
          const photoSrc = placePhotoFailureSignalSrc(url);
          return (
            <div key={url} className="w-40 shrink-0 space-y-1">
              <button
                type="button"
                onClick={() => setSelectedUrl(url)}
                aria-label={`View ${name} photo ${i + 2}`}
                className="relative h-28 w-40 cursor-zoom-in overflow-hidden rounded-[var(--app-radius-md)] border transition active:scale-[0.98]"
                style={{ borderColor: "var(--app-border)" }}
              >
                <Image
                  src={photoSrc}
                  alt=""
                  fill
                  unoptimized={photoSrc.startsWith("/api/place-photo")}
                  loading="lazy"
                  sizes="160px"
                  placeholder="blur"
                  blurDataURL={PAPER_CREAM_BLUR}
                  className="object-cover"
                  onLoad={(event) => {
                    if (isPlacePhotoFailureSignal(event.currentTarget)) {
                      markFailed(url);
                    }
                  }}
                  onError={() => markFailed(url)}
                />
              </button>
              <span className="block truncate px-0.5" style={{ color: "var(--app-ink-3)" }}>
                <GooglePhotoAttributionLine
                  attribution={attribution}
                  placeGoogleMapsUri={placeGoogleMapsUri}
                  compact
                  touchTarget
                />
              </span>
            </div>
          );
        })}
      </div>
      {selectedIndex !== null && (
        <PhotoLightbox
          key={`${selectedUrl}:${selectedIndex}`}
          photos={availablePhotos}
          attributions={availablePhotos.map((url) => ({
            attribution: googlePhotoAttributionForUrl(url, attributions),
            placeGoogleMapsUri,
          }))}
          startIndex={selectedIndex}
          alt={name}
          onClose={() => setSelectedUrl(null)}
        />
      )}
    </section>
  );
}

/** Keep lightbox selection attached to an image identity, not a moving array
 * position. If another thumbnail fails while the lightbox is open, the
 * selected image either moves safely with the filtered list or closes. */
export function selectedPhotoIndex(
  photos: readonly string[],
  selectedUrl: string | null,
): number | null {
  if (!selectedUrl) return null;
  const index = photos.indexOf(selectedUrl);
  return index >= 0 ? index : null;
}
