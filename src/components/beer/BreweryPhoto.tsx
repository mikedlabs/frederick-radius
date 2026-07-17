"use client";

import Image from "next/image";
import { useState } from "react";
import { BreweryLogo } from "./BreweryLogo";

export type BreweryPhotoMap = Readonly<Record<string, string | null>>;

type BreweryPhotoProps = {
  brewerySlug: string;
  breweryName: string;
  src?: string | null;
  alt?: string;
  decorative?: boolean;
  priority?: boolean;
  sizes: string;
  className?: string;
  imageClassName?: string;
};

/**
 * A real taproom photograph with a brewery-mark fallback. Beer visuals should
 * still feel specific when a remote place photo is missing or temporarily
 * unavailable; falling back to the actual brewery identity is more useful
 * than generic glass illustration.
 */
export function BreweryPhoto({
  brewerySlug,
  breweryName,
  src,
  alt,
  decorative = false,
  priority = false,
  sizes,
  className = "",
  imageClassName = "object-cover",
}: BreweryPhotoProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = Boolean(src && failedSrc !== src);

  return (
    <span className={`relative block overflow-hidden bg-[#1b1712] ${className}`}>
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
        <span className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(227,182,93,.16),transparent_46%),linear-gradient(145deg,#2b241b,#11100d)] p-[18%]">
          <BreweryLogo
            brewerySlug={brewerySlug}
            breweryName={breweryName}
            decorative={decorative}
            sizes={sizes}
            className="h-full w-full bg-[#f7f0e4] object-contain p-[8%] shadow-[0_18px_46px_rgba(0,0,0,.38)]"
          />
        </span>
      )}
    </span>
  );
}
