"use client";

import Image from "next/image";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import type { PlaceCardPhotoResult, PlaceCardPhotoSource } from "@/lib/place-card-photo";
import { GooglePhotoAttributionLine } from "./GoogleAttribution";

/** A photograph of the selected place, supplied by the canonical loader.
 * A missing or failed photo leaves the card's real name and facts intact. */
export default function PlaceCardPhoto({ source, onResult, width = 360, frame = "hero" }: {
  source: PlaceCardPhotoSource | null;
  onResult: (src: string, result: PlaceCardPhotoResult) => void;
  width?: number;
  frame?: "hero" | "row" | "compact-row";
}) {
  if (!source) return null;
  return (
    <span
      data-place-card-photo
      data-place-card-photo-source={source.kind}
      className={`relative block overflow-hidden bg-[var(--app-bg-sunken)] ${frame === "hero" ? "aspect-[16/9] w-full" : "rounded-[var(--app-radius-md)]"}`}
      style={frame === "hero" ? undefined : { width, height: frame === "row" ? 104 : 64 }}
    >
      <Image
        key={source.src}
        src={source.src}
        alt={source.alt}
        fill
        sizes={width === 180 ? "(max-width: 640px) 50vw, 180px" : `${width}px`}
        unoptimized={source.kind === "google"}
        placeholder="blur"
        blurDataURL={PAPER_CREAM_BLUR}
        className="object-cover"
        onLoad={(event) => {
          const failed = event.currentTarget.naturalWidth <= 1 || event.currentTarget.naturalHeight <= 1;
          onResult(source.src, failed ? "failed" : "loaded");
        }}
        onError={() => onResult(source.src, "failed")}
      />
    </span>
  );
}

/** Keep source links outside the card's open button, avoiding nested actions. */
export function PlaceCardPhotoCredit({ source, loaded, touchTarget = false, compact = false }: {
  source: PlaceCardPhotoSource | null;
  loaded: boolean;
  touchTarget?: boolean;
  compact?: boolean;
}) {
  if (!source || source.kind === "owned") return null;
  const licenseLinks: Record<string, string> = { "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0", "CC BY 2.0": "https://creativecommons.org/licenses/by/2.0" };
  const licenseHref = source.kind === "curated"
    ? (licenseLinks[source.photo.license]
      ?? `${source.photo.source_url}#Licensing`)
    : null;
  return (
    <div aria-hidden={!loaded || undefined} inert={!loaded || undefined}
      className="place-card-photo-credit border-t px-3 py-1 text-xs leading-snug [&_a]:inline-flex [&_a]:min-h-[44px] [&_a]:min-w-[44px] [&_a]:items-center"
      style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)", visibility: loaded ? undefined : "hidden" }}>
      {source.kind === "google" ? (
        <GooglePhotoAttributionLine attribution={source.attribution} compact touchTarget={touchTarget} />
      ) : (
        <>
          <span className="block pt-1">Photo by {source.photo.author}.{compact ? " Cropped for display." : ""}</span>
          {!compact && <span className="block">The image is resized for display; previews may be cropped.</span>}
          <span className="flex flex-wrap gap-x-3">
            <a href={source.photo.source_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Wikimedia Commons</a>
            <a href={licenseHref!} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{source.photo.license}</a>
          </span>
        </>
      )}
    </div>
  );
}
