"use client";

import { useState } from "react";
import Image from "next/image";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import PhotoLightbox from "@/components/ui/PhotoLightbox";

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
}: {
  photos: string[];
  name: string;
}) {
  const [at, setAt] = useState<number | null>(null);
  if (!photos || photos.length < 2) return null;

  return (
    <section className="space-y-2">
      <h2 className="eyebrow">Photos</h2>
      <div className="shelf-rail -mx-1 gap-2 px-1 pb-1">
        {photos.slice(1, 8).map((url, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setAt(i + 1)}
            aria-label={`View ${name} photo ${i + 2}`}
            className="relative h-28 w-40 shrink-0 cursor-zoom-in overflow-hidden rounded-[var(--app-radius-md)] border transition active:scale-[0.98]"
            style={{ borderColor: "var(--app-border)" }}
          >
            <Image
              src={url}
              alt=""
              fill
              loading="lazy"
              sizes="160px"
              placeholder="blur"
              blurDataURL={PAPER_CREAM_BLUR}
              className="object-cover"
            />
          </button>
        ))}
      </div>
      {at !== null && (
        <PhotoLightbox photos={photos} startIndex={at} alt={name} onClose={() => setAt(null)} />
      )}
    </section>
  );
}
