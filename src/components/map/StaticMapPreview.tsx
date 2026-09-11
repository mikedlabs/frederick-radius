"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A static locator that fails into a useful map handoff instead of showing a
 * browser broken-image glyph when the paid Static Images path is disabled,
 * out of allowance, or temporarily unavailable.
 */
export default function StaticMapPreview({
  src,
  alt,
  width,
  height,
  className,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = imageRef.current;
    // A cached or fast 503 may settle before React attaches onError during
    // hydration. Reconcile the browser's already-completed image state.
    if (image?.complete) setFailed(image.naturalWidth === 0);
  }, [src]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Plain <img>: the proxy already serves a right-sized @2x PNG. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        onLoad={() => setFailed(false)}
        hidden={failed}
        className="field-map-image h-full w-full object-cover"
      />
      <div
        role="img"
        aria-label={alt}
        aria-hidden={!failed}
        hidden={!failed}
        className="flex h-full w-full items-center justify-center gap-3 bg-[color:var(--app-bg-sunken)] px-5 text-[color:var(--app-ink-2)]"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-7 w-7 shrink-0 text-[color:var(--app-brand)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 10c0 4.7-5.1 9.4-7.3 11.2a1.1 1.1 0 0 1-1.4 0C9.1 19.4 4 14.7 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="2.4" />
        </svg>
        <span className="text-sm leading-snug">
          Map preview unavailable. Open the live map.
        </span>
      </div>
    </div>
  );
}
