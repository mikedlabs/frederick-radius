"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { GooglePhotoAttributionLine } from "@/components/place/GoogleAttribution";
import type {
  BreweryPhotoAsset,
  BreweryPhotoMap,
} from "@/lib/beer/brewery-media";
import { BreweryLogo } from "./BreweryLogo";

export type { BreweryPhotoMap };

type BreweryPhotoProps = {
  brewerySlug: string;
  breweryName: string;
  photo?: BreweryPhotoAsset | null;
  alt?: string;
  decorative?: boolean;
  compactFallback?: boolean;
  priority?: boolean;
  sizes: string;
  className?: string;
  imageClassName?: string;
  href?: string;
  linkLabel?: string;
  showLabel?: boolean;
};

/**
 * A publishable taproom photograph with a brewery-mark fallback. We do not
 * silently substitute downloaded third-party photography or an unsourced
 * brewery mark when photo attribution is unavailable.
 */
export function BreweryPhoto({
  brewerySlug,
  breweryName,
  photo,
  alt,
  decorative = false,
  compactFallback = false,
  priority = false,
  sizes,
  className = "",
  imageClassName = "object-cover",
  href,
  linkLabel,
  showLabel = false,
}: BreweryPhotoProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = photo?.src;
  const showPhoto = Boolean(src && failedSrc !== src);
  return (
    <span
      data-brewery-media={showPhoto ? "photo" : "mark"}
      data-brewery-slug={brewerySlug}
      className={`relative block overflow-hidden bg-[var(--app-bg-sunken)] ${className}`}
    >
      {showPhoto && src ? (
        <Image
          src={src}
          alt={decorative ? "" : (alt ?? `${breweryName} taproom`)}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized={src.startsWith("/api/place-photo")}
          className={imageClassName}
          onLoad={(event) => {
            // The photo proxy returns a 1×1 signal image when a brewery photo
            // could not be fetched. Do not label that fallback as a Google
            // photograph; switch to the honest local plate instead.
            if (
              event.currentTarget.naturalWidth === 1 &&
              event.currentTarget.naturalHeight === 1
            ) {
              setFailedSrc(src);
            }
          }}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span
          aria-hidden={decorative || undefined}
          aria-label={decorative ? undefined : `${breweryName} photo unavailable`}
          role={decorative ? undefined : "img"}
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background:
              "linear-gradient(145deg, var(--app-bg-elevated-solid), var(--app-bg-sunken))",
          }}
        >
          <BreweryLogo
            brewerySlug={brewerySlug}
            breweryName={breweryName}
            decorative
            sizes={compactFallback ? "112px" : "180px"}
            // The mark only mounts after the primary venue image has failed.
            // Load the replacement immediately instead of leaving an empty
            // fallback plate until the next lazy-loading intersection.
            loading="eager"
            className={`bg-white/75 p-2 mix-blend-multiply ${
              compactFallback
                ? "h-[68%] w-[74%]"
                : "mb-7 h-[58%] w-[58%] max-h-[132px] max-w-[180px] rounded-sm"
            }`}
          />
          {!compactFallback ? (
            <span className="absolute inset-x-3 bottom-3 max-w-[14rem]">
              <span className="block font-sans text-[clamp(.8rem,3.5vw,1.05rem)] font-semibold leading-tight text-[var(--app-ink)]">
                {breweryName}
              </span>
              <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--app-ink-3)]">
                Frederick County brewery
              </span>
            </span>
          ) : null}
        </span>
      )}
      {showPhoto && showLabel ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/78 via-black/45 to-transparent px-3 pb-2.5 pt-8 text-left text-white">
          <span className="block text-[12px] font-semibold leading-tight">
            {breweryName}
          </span>
        </span>
      ) : null}
      {href ? (
        <Link
          href={href}
          aria-label={linkLabel ?? `Open ${breweryName}`}
          className="absolute inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-amber)]"
        />
      ) : null}
      {showPhoto && photo?.attribution ? (
        <span
          className="absolute right-1.5 top-1.5 z-10 max-w-[72%] rounded-sm bg-black/64 px-1.5 py-1 text-right text-[8px] leading-none text-white shadow-sm backdrop-blur-sm"
          aria-label="Google photo attribution"
        >
          <GooglePhotoAttributionLine
            attribution={photo.attribution}
            compact
            showAvatar={false}
          />
        </span>
      ) : null}
    </span>
  );
}
