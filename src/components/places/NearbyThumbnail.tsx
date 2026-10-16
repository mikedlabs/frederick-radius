"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/** Nearby history remains readable when its optional decorative photo fails. */
export default function NearbyThumbnail({ src }: { src: string }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    const image = imageRef.current;
    // A fast or cached failure may finish before hydration attaches onError.
    let active = true;
    if (image?.complete && image.naturalWidth === 0) {
      queueMicrotask(() => {
        if (active && imageRef.current === image && image.complete && image.naturalWidth === 0) setFailedSrc(src);
      });
    }
    return () => { active = false; };
  }, [src]);

  if (failedSrc === src) return <span hidden data-nearby-thumbnail-failed={src} />;

  return (
    <Image
      key={src}
      ref={imageRef}
      src={src}
      alt=""
      width={56}
      height={56}
      className="mt-0.5 h-14 w-14 shrink-0 rounded-[var(--app-radius-sm)] object-cover"
      style={{ boxShadow: "var(--app-edge)" }}
      onError={() => setFailedSrc(src)}
    />
  );
}
