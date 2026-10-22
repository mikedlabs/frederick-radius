"use client";

import { useState } from "react";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import PhotoLightbox from "@/components/ui/PhotoLightbox";
import { PlaceCardPhotoCredit } from "@/components/place/PlaceCardPhoto";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
import {
  isPlacePhotoFailureSignal,
  placePhotoFailureSignalSrc,
  placePhotoGallerySources,
  type PlaceCardPhotoSource,
} from "@/lib/place-card-photo";

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
  slug,
  photos,
  name,
  heroSrc,
  heroAttribution,
  attributions = [],
}: {
  slug: string;
  photos: string[];
  heroSrc?: string;
  heroAttribution?: GooglePhotoAttribution;
  name: string;
  attributions?: GooglePhotoAttribution[];
}) {
  const sources = placePhotoGallerySources({ slug, google_photo_url: heroSrc ?? photos[0],
    google_photo_attribution: heroAttribution, google_photos: photos, google_photo_attributions: attributions }, 360);
  return <PlacePhotoGalleryView sources={sources} name={name} />;
}

/** Rendering owns only resolved source records; the wrapper above keeps the
 * existing publishable-photo policy and provider attribution boundary. */
export function PlacePhotoGalleryView({ sources, name }: {
  sources: readonly PlaceCardPhotoSource[];
  name: string;
}) {
  const [viewer, setViewer] = useState<{
    sources: readonly PlaceCardPhotoSource[];
    startIndex: number;
    name: string;
  } | null>(null);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(() => new Set());
  const availableSources = sources.filter((source) => !failedUrls.has(source.src));
  const [emblaRef] = useEmblaCarousel({
    dragFree: true,
    containScroll: "trimSnaps",
  });

  const markFailed = (url: string) => {
    setFailedUrls((current) => {
      if (current.has(url)) return current;
      const next = new Set(current);
      next.add(url);
      return next;
    });
  };

  const openPhoto = (src: string) => {
    const startIndex = availableSources.findIndex((source) => source.src === src);
    if (startIndex < 0) return;
    // A late thumbnail failure can collapse the rail. It must not unmount the
    // viewer or strand the viewer's temporary native Back entry.
    setViewer({ sources: [...availableSources], startIndex, name });
  };

  return (
    <>
    {availableSources.length >= 2 && <section className="space-y-2">
      <h2 className="eyebrow">Photos</h2>
      <div className="embla overflow-hidden -mx-1 px-1 pb-1" ref={emblaRef}>
        <div className="embla__container flex gap-2">
          {availableSources.slice(1, 8).map((source, i) => {
            const url = source.src;
            const photoSrc = placePhotoFailureSignalSrc(url);
            return (
              <div key={url} className="embla__slide w-40 shrink-0 space-y-1">
                <button
                  type="button"
                  onClick={() => openPhoto(url)}
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
                    style={source.kind !== "google" ? { objectPosition: source.objectPosition } : undefined}
                    onLoad={(event) => {
                      if (isPlacePhotoFailureSignal(event.currentTarget)) {
                        markFailed(url);
                      } else {
                        setLoadedUrls((current) => new Set([...current, url]));
                      }
                    }}
                    onError={() => markFailed(url)}
                  />
                </button>
                <PlaceCardPhotoCredit source={source} loaded={loadedUrls.has(url)} />
              </div>
            );
          })}
        </div>
      </div>
    </section>}
      {viewer && (
        <PhotoLightbox
          key={viewer.sources[viewer.startIndex].src}
          sources={viewer.sources}
          startIndex={viewer.startIndex}
          alt={viewer.name}
          onClose={() => setViewer(null)}
        />
      )}
    </>
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
