"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { isPlacePhotoFailureSignal, type PlaceCardPhotoResult } from "@/lib/place-card-photo";

/** One display lifecycle per exact source. The parent owns its source plan and
 * credits; this image reports decode/failure without retaining provider bytes. */
export default function CompactPlacePhoto(props: {
  src: string;
  size: number;
  objectPosition?: string;
  onResult: (src: string, result: PlaceCardPhotoResult) => void;
}) {
  return <SourceImage key={props.src} {...props} />;
}

function SourceImage({ src, size, objectPosition, onResult }: {
  src: string;
  size: number;
  objectPosition?: string;
  onResult: (src: string, result: PlaceCardPhotoResult) => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const active = useRef(true);
  const resultRef = useRef<PlaceCardPhotoResult | null>(null);
  const callback = useRef(onResult);
  useLayoutEffect(() => { callback.current = onResult; }, [onResult]);
  const [result, setResult] = useState<PlaceCardPhotoResult | null>(null);
  const report = (next: PlaceCardPhotoResult) => {
    if (!active.current || resultRef.current === "failed" || resultRef.current === next) return;
    resultRef.current = next;
    setResult(next);
    callback.current(src, next);
  };
  const reportRef = useRef(report);
  useLayoutEffect(() => { reportRef.current = report; });
  useEffect(() => {
    active.current = true;
    const image = imageRef.current;
    // Hydration can attach after a cached success, failure, or 1px proxy signal.
    if (image?.complete) queueMicrotask(() => {
      if (active.current && imageRef.current === image && image.complete) {
        reportRef.current(isPlacePhotoFailureSignal(image) ? "failed" : "loaded");
      }
    });
    return () => { active.current = false; };
  }, []);

  if (result === "failed") return null;
  return <Image ref={imageRef} src={src} alt="" fill loading="lazy"
    sizes={`${size}px`} unoptimized={src.startsWith("/api/place-photo")}
    placeholder="blur" blurDataURL={PAPER_CREAM_BLUR} className="object-cover"
    style={objectPosition ? { objectPosition } : undefined}
    data-compact-place-photo={result ?? "pending"}
    onLoad={(event) => report(isPlacePhotoFailureSignal(event.currentTarget) ? "failed" : "loaded")}
    onError={() => report("failed")} />;
}
