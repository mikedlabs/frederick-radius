"use client";

import Image from "next/image";
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { PlaceCardPhotoCredit } from "@/components/place/PlaceCardPhoto";
import { isPlacePhotoFailureSignal, placePhotoFailureSignalSrc, type PlaceCardPhotoSource } from "@/lib/place-card-photo";

type VisualContext = {
  source: PlaceCardPhotoSource | null;
  identity: string;
  loaded: boolean;
  failed: boolean;
  resolve: (result: "loaded" | "failed") => void;
};
const Context = createContext<VisualContext | null>(null);

/** The image and its source links share one exact identity while the result
 * keeps its real navigation anchor. Credits are siblings, never nested links. */
export default function SearchPlaceVisual({ source, children }: {
  source: PlaceCardPhotoSource | null;
  children: ReactNode;
}) {
  const key = source ? JSON.stringify(source) : "none";
  const activeKey = useRef(key);
  useLayoutEffect(() => { activeKey.current = key; }, [key]);
  const [result, setResult] = useState<{ key: string; state: "loaded" | "failed" } | null>(null);
  const failed = result?.key === key && result.state === "failed";
  const loaded = result?.key === key && result.state === "loaded";
  const resolve = (state: "loaded" | "failed") => {
    if (activeKey.current !== key) return;
    // A late load after an error cannot restore exhausted media or its credit.
    setResult((previous) => previous?.key === key && previous.state === "failed"
      ? previous : { key, state });
  };
  return <Context value={{ source, identity: key, loaded, failed, resolve }}>{children}</Context>;
}

export function SearchPlaceVisualImage({ fallback, size = 56, className = "" }: {
  fallback: ReactNode;
  size?: number;
  className?: string;
}) {
  const visual = useContext(Context);
  const source = visual?.source;
  const src = source ? placePhotoFailureSignalSrc(source.src) : null;
  return (
    <span aria-hidden className={`relative block shrink-0 overflow-hidden rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)] ${className}`}
      style={{ width: size, height: size }} data-search-place-visual={source?.kind ?? "none"}>
      <span className="absolute inset-0 grid place-items-center">{fallback}</span>
      {source && src && !visual.failed && <Image key={visual.identity} src={src} alt="" fill sizes={`${size}px`}
        unoptimized={source.kind === "google"} className="object-cover" loading="lazy"
        onError={() => visual.resolve("failed")}
        onLoad={(event) => visual.resolve(isPlacePhotoFailureSignal(event.currentTarget) ? "failed" : "loaded")} />}
    </span>
  );
}

export function SearchPlaceVisualCredit() {
  const visual = useContext(Context);
  if (!visual?.source || !visual.loaded || visual.failed) return null;
  return <PlaceCardPhotoCredit source={visual.source} loaded touchTarget />;
}
