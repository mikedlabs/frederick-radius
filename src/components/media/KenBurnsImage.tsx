"use client";

import Image from "next/image";
import { useState, type SyntheticEvent } from "react";

/**
 * A still cover first, then the slow Ken Burns drift after the pixels exist.
 * Reduced-motion CSS keeps the still. Place-photo fallbacks (1px signal or an
 * `x-photo-fallback` response) never become a moving cover.
 */
export default function KenBurnsImage({
  src,
  alt = "",
  fill,
  width,
  height,
  priority = false,
  sizes,
  unoptimized,
  placeholder,
  blurDataURL,
  className = "",
  confirmFallbackHeader = false,
  onUnavailable,
}: {
  src: string;
  alt?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  priority?: boolean;
  sizes?: string;
  unoptimized?: boolean;
  placeholder?: "blur" | "empty";
  blurDataURL?: string;
  className?: string;
  /** Today’s lead photo also reads `x-photo-fallback` so an SVG plate never becomes LCP. */
  confirmFallbackHeader?: boolean;
  onUnavailable?: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const unavailable = () => {
    setFailed(true);
    onUnavailable?.();
  };

  if (failed) return null;

  const confirm = async (image: HTMLImageElement) => {
    if (image.naturalWidth <= 1 || image.naturalHeight <= 1) {
      unavailable();
      return;
    }
    if (confirmFallbackHeader && src.includes("/api/place-photo")) {
      try {
        const response = await fetch(image.currentSrc || src);
        if (!response.ok || response.headers.get("x-photo-fallback")) {
          unavailable();
          return;
        }
      } catch {
        unavailable();
        return;
      }
    }
    setReady(true);
  };

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      priority={priority}
      sizes={sizes}
      unoptimized={unoptimized ?? (src.startsWith("/api/place-photo") || src.startsWith("blob:"))}
      placeholder={placeholder}
      blurDataURL={blurDataURL}
      data-cover-motion={ready ? "ready" : "still"}
      className={["ken-burns", ready ? "ken-burns-ready" : "", className].filter(Boolean).join(" ")}
      onLoad={(event: SyntheticEvent<HTMLImageElement>) => {
        void confirm(event.currentTarget);
      }}
      onError={unavailable}
    />
  );
}
