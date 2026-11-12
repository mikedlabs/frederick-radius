"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { curatedPhotoCredit } from "@/lib/curated-photo-source";
import type { PlaceCardPhotoResult, PlaceCardPhotoSource } from "@/lib/place-card-photo";
import { GooglePhotoAttributionLine } from "./GoogleAttribution";
import PhotoCreditLine from "./PhotoCreditLine";
import { useVisibleGooglePhoto } from "./useVisibleGooglePhoto";

/** A photograph of the selected place, supplied by the canonical loader.
 * A missing or failed photo leaves the card's real name and facts intact. */
export default function PlaceCardPhoto({ source, onResult, width = 360, frame = "hero", sizes, deferGoogleBytes = false, decodeIdentity }: {
  source: PlaceCardPhotoSource | null;
  onResult: (src: string, result: PlaceCardPhotoResult) => void;
  width?: number;
  frame?: "hero" | "row" | "compact-row";
  /** The actual responsive frame; existing fixed-width surfaces keep their defaults. */
  sizes?: string;
  /** Wait for the visible list frame before requesting Google bytes. */
  deferGoogleBytes?: boolean;
  /** Re-decode changed source credit without replacing the settled byte owner. */
  decodeIdentity?: string | null;
}) {
  const defer = Boolean(deferGoogleBytes && source?.kind === "google");
  const sourceSrc = source?.src ?? null;
  const awaitingNativeLoad = useRef<HTMLImageElement | null>(null);
  const { frameRef, bytes } = useVisibleGooglePhoto(defer ? sourceSrc : null, defer);
  useEffect(() => {
    if (defer && sourceSrc && bytes.status === "fallback") onResult(sourceSrc, "failed");
  }, [bytes.status, defer, onResult, sourceSrc]);

  if (!source) return null;
  return (
    <span
      ref={frameRef}
      data-place-card-photo
      data-place-card-photo-source={source.kind}
      data-place-card-photo-bytes={defer ? bytes.status : undefined}
      className={`relative block overflow-hidden bg-[var(--app-bg-sunken)] ${frame === "hero" ? "aspect-[16/9] w-full" : "rounded-[var(--app-radius-md)]"}`}
      style={frame === "hero" ? undefined : { width, height: frame === "row" ? 104 : 64 }}
    >
      {defer ? (bytes.status === "ready" && (
        // Reuse the one fetched response. A second network image request would
        // consume another reservation on this no-store transport.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={decodeIdentity == null ? bytes.objectUrl : `${bytes.objectUrl}:${decodeIdentity}`}
          src={bytes.objectUrl}
          alt={source.alt}
          className="absolute inset-0 h-full w-full object-cover"
          onLoad={(event) => onResult(source.src,
            event.currentTarget.naturalWidth <= 1 || event.currentTarget.naturalHeight <= 1 ? "failed" : "loaded")}
          onError={() => onResult(source.src, "failed")}
        />
      )) : (
        <Image
          key={decodeIdentity ?? source.src}
          src={source.src}
          alt={source.alt}
          fill
          sizes={sizes ?? (width === 180 ? "(max-width: 640px) 50vw, 180px" : `${width}px`)}
          unoptimized={source.kind === "google"}
          placeholder="blur"
          blurDataURL={PAPER_CREAM_BLUR}
          className="object-cover"
          style={source.kind !== "google" ? { objectPosition: source.objectPosition } : undefined}
          onLoadCapture={(event) => {
            const image = event.currentTarget;
            if (awaitingNativeLoad.current !== image) return;
            awaitingNativeLoad.current = null;
            const failed = image.naturalWidth <= 1 || image.naturalHeight <= 1;
            onResult(source.src, failed ? "failed" : "loaded");
          }}
          onLoad={(event) => {
            const image = event.currentTarget;
            if (!image.isConnected) return;
            // Next can synthesize onLoad after a lazy mount-time decode rejects
            // before WebKit has selected a source. It also deduplicates the
            // later load callback, so retain this image for the real native
            // load capture rather than dropping it or retrying its bytes.
            if (image.currentSrc === "" && image.naturalWidth === 0 && image.naturalHeight === 0) {
              awaitingNativeLoad.current = image;
              return;
            }
            if (awaitingNativeLoad.current === image) awaitingNativeLoad.current = null;
            const failed = image.naturalWidth <= 1 || image.naturalHeight <= 1;
            onResult(source.src, failed ? "failed" : "loaded");
          }}
          onError={(event) => {
            if (awaitingNativeLoad.current === event.currentTarget) awaitingNativeLoad.current = null;
            onResult(source.src, "failed");
          }}
        />
      )}
    </span>
  );
}

/** Keep source links outside the card's open button, avoiding nested actions. */
export function PlaceCardPhotoCredit({ source, loaded, touchTarget = false }: {
  source: PlaceCardPhotoSource | null;
  loaded: boolean;
  touchTarget?: boolean;
}) {
  if (!source || (source.kind === "owned" && source.referenceContext !== "appearance-unverified")) return null;
  return (
    <div aria-hidden={!loaded || undefined} inert={!loaded || undefined}
      className="place-card-photo-credit border-t px-3 py-1 text-xs leading-snug [&_a]:inline-flex [&_a]:min-h-[44px] [&_a]:min-w-[44px] [&_a]:items-center"
      style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)", visibility: loaded ? undefined : "hidden" }}>
      {source.kind === "owned" ? (
        <span className="block" data-place-photo-reference-context>Reference photo · Appearance unverified</span>
      ) : source.kind === "google" ? (
        <GooglePhotoAttributionLine attribution={source.attribution} compact touchTarget={touchTarget} />
      ) : (
        <PhotoCreditLine credit={curatedPhotoCredit(source.photo)} />
      )}
    </div>
  );
}
