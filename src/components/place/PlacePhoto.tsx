"use client";

import Image from "next/image";
import { useState } from "react";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

/**
 * Wraps next/image with graceful failure: if the image fails to load,
 * silently swap to a category-colored gradient + glyph fallback so we
 * never show a broken image icon to the user.
 */
export default function PlacePhoto({
  src,
  alt,
  glyph,
  color,
  sizes,
  className = "",
  rounded = "var(--app-radius-md)",
}: {
  src: string;
  alt: string;
  glyph: string;
  color: string;
  sizes: string;
  className?: string;
  rounded?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        aria-hidden
        className={`flex items-center justify-center ${className}`}
        style={{
          background: `linear-gradient(135deg, ${color}26 0%, ${color}10 100%)`,
          color,
          borderRadius: rounded,
        }}
      >
        <span className="text-[26px] leading-none">{glyph}</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      unoptimized={src.startsWith("/api/place-photo")}
      sizes={sizes}
      placeholder="blur"
      blurDataURL={PAPER_CREAM_BLUR}
      className={`object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
