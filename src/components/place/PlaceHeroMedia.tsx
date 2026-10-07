"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

/** Ask the same-origin Google proxy for its transparent failure signal. A
 * branded 200-status placeholder is useful in generic cards, but a hero must
 * be able to distinguish it from photography before showing photo credit. */
export function placePhotoFailureSignalSrc(src: string): string {
  if (!src.startsWith("/api/place-photo")) return src;
  const url = new URL(src, "https://frederickradius.local");
  url.searchParams.set("fallback", "signal");
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export function isPlacePhotoFailureSignal(image: {
  naturalWidth: number;
  naturalHeight: number;
}): boolean {
  return image.naturalWidth <= 1 && image.naturalHeight <= 1;
}

/** One photograph the hero may show, with the credit that belongs to it. */
export type PlaceHeroPhoto = {
  src: string;
  alt: string;
  /** Rendered on the photo only after it has loaded. */
  credit?: ReactNode;
};

/**
 * The place hero's photo frame.
 *
 * It tries each candidate photo in order (a curated landmark photo and the
 * Google photo, in the order PlaceHero chose) and shows the first one that
 * actually decodes. A request that errors or returns the proxy's 1px failure
 * signal moves on to the next candidate; when none loads, the frame is
 * replaced by `fallback` (the place's block on the map), so a failed photo
 * never leaves an empty plate behind. A credit renders only once its own
 * photo has loaded.
 *
 * The photo is shown as taken: no time-of-day wash, golden-hour glow or dark
 * scrim. The brand guide rules out washes over photographs, and the only type
 * on the frame is the credit, which carries its own panel.
 */
export default function PlaceHeroMedia({
  photos,
  width,
  height,
  size,
  priority,
  aspectRatio,
  fallback,
}: {
  photos: PlaceHeroPhoto[];
  width: number;
  height: number;
  size: "card" | "hero";
  priority: boolean;
  aspectRatio: string;
  fallback?: ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const photo = photos[attempt];

  if (!photo) return fallback ? <>{fallback}</> : null;

  const photoSrc = placePhotoFailureSignalSrc(photo.src);
  const ready = loadedSrc === photoSrc;
  const tryNext = () => setAttempt((current) => current + 1);

  return (
    <div
      data-place-hero
      data-place-hero-kind="photo"
      data-place-hero-size={size}
      // The detail-page hero is clamped to ~half the viewport height so a
      // 16/10 ratio at full width can't swallow a short LANDSCAPE-phone
      // screen. The cap never binds in portrait (16/10 of phone width is well
      // under 38vh), so it only kicks in where that bug lived.
      className={`relative w-full overflow-hidden bg-[var(--app-bg-sunken)]${
        size === "hero" ? " max-h-[38vh]" : ""
      }`}
      style={{ aspectRatio }}
    >
      <Image
        key={photoSrc}
        src={photoSrc}
        alt={photo.alt}
        width={width}
        height={height}
        unoptimized={photoSrc.startsWith("/api/place-photo")}
        priority={priority && attempt === 0}
        fetchPriority={priority && attempt === 0 ? "high" : "auto"}
        sizes={
          size === "hero"
            ? "(max-width: 720px) 100vw, 720px"
            : "(max-width: 720px) 50vw, 360px"
        }
        placeholder="blur"
        blurDataURL={PAPER_CREAM_BLUR}
        className={`absolute inset-0 h-full w-full object-cover${
          size === "hero" ? " ken-burns" : ""
        }`}
        onLoad={(event) => {
          if (isPlacePhotoFailureSignal(event.currentTarget)) tryNext();
          else setLoadedSrc(photoSrc);
        }}
        onError={tryNext}
      />

      {ready && photo.credit ? (
        <div
          data-place-photo-credit
          className="absolute bottom-2 right-2 z-20 max-w-[80%] rounded bg-black/70 px-2 py-1 text-right text-white shadow-sm backdrop-blur-sm"
        >
          {photo.credit}
        </div>
      ) : null}
    </div>
  );
}
