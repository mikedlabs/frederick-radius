"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { curatedPhotoReferenceLabel, curatedPhotoSourceLabel } from "@/lib/curated-photo-source";
import type { PlaceCardPhotoResult, PlaceCardPhotoSource } from "@/lib/place-card-photo";
import { GooglePhotoAttributionLine } from "./GoogleAttribution";
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
export function PlaceCardPhotoCredit({ source, loaded, touchTarget = false, compact = false, discloseModifications = false }: {
  source: PlaceCardPhotoSource | null;
  loaded: boolean;
  touchTarget?: boolean;
  compact?: boolean;
  /** Map preview only: keep linked creator/license visible and disclose full edits. */
  discloseModifications?: boolean;
}) {
  if (!source || (source.kind === "owned" && source.referenceContext !== "appearance-unverified")) return null;
  const sourceLabel = source.kind === "curated" ? curatedPhotoSourceLabel(source.photo.source_url) : "";
  const countyProvided = sourceLabel === "Frederick County";
  const creditPrefix = countyProvided ? "Photo provided by" : "Photo by";
  const referenceLabel = source.kind === "curated" ? curatedPhotoReferenceLabel(source.photo.capturedOn) : null;
  const licenseLinks: Record<string, string> = { "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0", "CC BY 2.0": "https://creativecommons.org/licenses/by/2.0" };
  const licenseHref = source.kind === "curated"
    ? (source.photo.licenseUrl ?? licenseLinks[source.photo.license]
      ?? `${source.photo.source_url}#Licensing`)
    : null;
  return (
    <div aria-hidden={!loaded || undefined} inert={!loaded || undefined}
      className="place-card-photo-credit border-t px-3 py-1 text-xs leading-snug [&_a]:inline-flex [&_a]:min-h-[44px] [&_a]:min-w-[44px] [&_a]:items-center"
      data-photo-modifications-disclosure={discloseModifications && source.kind === "curated" || undefined}
      style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)", visibility: loaded ? undefined : "hidden" }}>
      {source.kind === "owned" ? (
        <span className="block" data-place-photo-reference-context>Reference photo · Appearance unverified</span>
      ) : source.kind === "google" ? (
        <GooglePhotoAttributionLine attribution={source.attribution} compact touchTarget={touchTarget} />
      ) : (
        <>
          {referenceLabel && <span className="block pt-1" data-photo-reference>{referenceLabel}</span>}
          {!discloseModifications && <span className="block pt-1">{creditPrefix} {source.photo.author}.{compact && !source.photo.modifications ? " Cropped for display." : ""}</span>}
          {!discloseModifications && (source.photo.modifications
            ? <span className="block">{source.photo.modifications}</span>
            : !compact && <span className="block">The image is resized for display; previews may be cropped.</span>)}
          <div className="place-card-photo-credit-row flex flex-wrap gap-x-3">
            <a href={source.photo.source_url} aria-label={discloseModifications ? `${creditPrefix} ${source.photo.author}. ${sourceLabel}` : undefined} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{discloseModifications ? source.photo.author : sourceLabel}</a>
            <a href={licenseHref!} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{source.photo.license}</a>
            {discloseModifications && (
              <details className="place-card-photo-edits">
                <summary>{countyProvided ? "Photo details" : "Edited photo"}</summary>
                <div className="place-card-photo-credit-details">
                  <p>{countyProvided ? `The photo was provided by ${source.photo.author}. Source: ${sourceLabel}.` : `The photo is by ${source.photo.author} on ${sourceLabel}.`}</p>
                  <p>{source.photo.modifications ?? "The image is resized for display; previews may be cropped."}</p>
                </div>
              </details>
            )}
          </div>
        </>
      )}
    </div>
  );
}
