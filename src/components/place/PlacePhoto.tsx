"use client";

import Image from "next/image";
import { useState } from "react";
import CategoryIcon from "./CategoryIcon";

/**
 * Wraps next/image with graceful failure. A failed photo (Google URL
 * expired, proxy 404, key unset) must never read as broken: it
 * degrades to the SAME composed category identity block the cards use
 * for photo-less places — a tinted radial wash + the category's Lucide
 * vector, filling the media box. Pass `slug` for the vector; `glyph`
 * is the legacy path for non-category surfaces (kept large and
 * centered on the same wash, never a tiny mark on an empty box).
 */
export default function PlacePhoto({
  src,
  alt,
  glyph,
  color,
  sizes,
  slug,
  className = "",
  rounded = "var(--app-radius-md)",
}: {
  src: string;
  alt: string;
  glyph: string;
  color: string;
  sizes: string;
  /** Category slug — renders the consistent Lucide identity icon. */
  slug?: string;
  className?: string;
  rounded?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center"
        style={{
          background: `radial-gradient(125% 125% at 30% 18%, ${color}40, ${color}14 72%)`,
          color,
          borderRadius: rounded,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 16%, transparent)`,
        }}
      >
        {slug ? (
          <CategoryIcon
            slug={slug}
            strokeWidth={1.5}
            className="h-[40%] max-h-16 min-h-8 w-auto"
            style={{ color }}
          />
        ) : (
          <span className="text-[clamp(28px,18%,52px)] leading-none">
            {glyph}
          </span>
        )}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={`object-cover ${className}`}
      onError={() => setFailed(true)}
      unoptimized
    />
  );
}
