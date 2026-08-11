"use client";

import { useState } from "react";
import Image from "next/image";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { GooglePhotoAttributionLine } from "@/components/place/GoogleAttribution";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";

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

export default function PlaceHeroMedia({
  src,
  alt,
  width,
  height,
  size,
  priority,
  usesGooglePhoto,
  photoAttribution,
  googleMapsUri,
  skyTop,
  skyBottom,
  golden,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  size: "card" | "hero";
  priority: boolean;
  usesGooglePhoto: boolean;
  photoAttribution?: GooglePhotoAttribution;
  googleMapsUri?: string;
  skyTop?: string;
  skyBottom?: string;
  golden: boolean;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const photoSrc = placePhotoFailureSignalSrc(src);

  if (status === "failed") {
    return <span hidden data-place-photo-failed />;
  }

  return (
    <>
      <Image
        src={photoSrc}
        alt={alt}
        width={width}
        height={height}
        unoptimized={photoSrc.startsWith("/api/place-photo")}
        priority={priority}
        fetchPriority={priority ? "high" : "auto"}
        sizes={
          size === "hero"
            ? "(max-width: 720px) 100vw, 720px"
            : "(max-width: 720px) 50vw, 360px"
        }
        placeholder="blur"
        blurDataURL={PAPER_CREAM_BLUR}
        className={`absolute inset-0 z-0 h-full w-full object-cover${
          size === "hero" ? " ken-burns" : ""
        }`}
        onLoad={(event) => {
          setStatus(
            isPlacePhotoFailureSignal(event.currentTarget) ? "failed" : "ready",
          );
        }}
        onError={() => setStatus("failed")}
      />

      {usesGooglePhoto && status === "ready" ? (
        <div
          className="absolute bottom-2 right-2 z-20 max-w-[80%] rounded bg-black/70 px-2 py-1 text-right text-white shadow-sm backdrop-blur-sm"
          aria-label="Google photo attribution"
        >
          <GooglePhotoAttributionLine
            attribution={photoAttribution}
            placeGoogleMapsUri={googleMapsUri}
            compact={size === "card"}
            touchTarget
          />
        </div>
      ) : null}

      {skyTop && skyBottom ? (
        <>
          <div
            aria-hidden
            className="absolute inset-0 z-10"
            style={{
              mixBlendMode: "soft-light",
              background: `linear-gradient(165deg, color-mix(in srgb, ${skyTop} 24%, transparent) 0%, transparent 46%, color-mix(in srgb, ${skyBottom} 32%, transparent) 100%)`,
            }}
          />
          {golden ? (
            <div
              aria-hidden
              className="absolute inset-0 z-10"
              style={{
                background:
                  "radial-gradient(120% 80% at 85% 8%, color-mix(in srgb, var(--app-brand) 16%, transparent) 0%, transparent 60%)",
              }}
            />
          ) : null}
        </>
      ) : null}

      <div
        aria-hidden
        className="absolute inset-0 z-10"
        style={{
          background:
            "linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </>
  );
}
