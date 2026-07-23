"use client";

import Image from "next/image";
import { useState } from "react";

export type BreweryPhotoMap = Readonly<Record<string, string | null>>;

type BreweryPhotoProps = {
  brewerySlug: string;
  breweryName: string;
  src?: string | null;
  alt?: string;
  decorative?: boolean;
  compactFallback?: boolean;
  priority?: boolean;
  sizes: string;
  className?: string;
  imageClassName?: string;
};

/**
 * A publishable taproom photograph with a typographic fallback. We do not
 * silently substitute downloaded third-party photography or an unsourced
 * brewery mark when photo attribution is unavailable.
 */
export function BreweryPhoto({
  breweryName,
  src,
  alt,
  decorative = false,
  compactFallback = false,
  priority = false,
  sizes,
  className = "",
  imageClassName = "object-cover",
}: BreweryPhotoProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = Boolean(src && failedSrc !== src);
  const initials = breweryName
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || "FR";

  return (
    <span className={`relative block overflow-hidden bg-[var(--app-bg-sunken)] ${className}`}>
      {showPhoto && src ? (
        <Image
          src={src}
          alt={decorative ? "" : (alt ?? `${breweryName} taproom`)}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized={src.startsWith("/api/place-photo")}
          className={imageClassName}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span
          aria-hidden={decorative || undefined}
          aria-label={decorative ? undefined : `${breweryName} photo unavailable`}
          role={decorative ? undefined : "img"}
          className={`absolute inset-0 flex flex-col ${
            compactFallback ? "items-center justify-center p-2" : "justify-between p-[12%]"
          }`}
          style={{
            background:
              "radial-gradient(circle at 82% 16%, color-mix(in srgb, var(--app-amber) 20%, transparent), transparent 35%), linear-gradient(145deg, var(--app-bg-elevated-solid), var(--app-bg-sunken))",
          }}
        >
          <span
            aria-hidden
            className={`font-sans font-semibold leading-none tracking-[-0.08em] ${
              compactFallback
                ? "text-[clamp(2rem,10vw,3.5rem)]"
                : "text-[clamp(2.6rem,14vw,5rem)]"
            }`}
            style={{ color: "color-mix(in srgb, var(--app-amber-text) 24%, transparent)" }}
          >
            {initials}
          </span>
          {!compactFallback ? (
            <span className="max-w-[14rem]">
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
    </span>
  );
}
