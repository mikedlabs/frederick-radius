"use client";

import Image from "next/image";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import styles from "./SearchPlaceVisual.module.css";
import { curatedPhotoUrl } from "@/lib/integrations/wikimedia";
import { useVisibleGooglePhoto } from "@/components/place/useVisibleGooglePhoto";
import { PlaceCardPhotoCredit } from "@/components/place/PlaceCardPhoto";
import { isPlacePhotoFailureSignal, placePhotoFailureSignalSrc, type PlaceCardPhotoSource } from "@/lib/place-card-photo";

type VisualContext = {
  source: PlaceCardPhotoSource | null;
  identity: { key: string };
  loaded: boolean;
  failed: boolean;
  resolve: (result: "loaded" | "failed") => void;
};
const Context = createContext<VisualContext | null>(null);

/** The image and its source links share one exact identity while the result
 * keeps its real navigation anchor. Credits are siblings, never nested links. */
export default function SearchPlaceVisual({ source: suppliedSource, children, lead = false }: {
  source: PlaceCardPhotoSource | null;
  children: ReactNode;
  /** One free curated lead may use a sharper width of the same reviewed file. */
  lead?: boolean;
}) {
  const source = lead && suppliedSource?.kind === "curated"
    ? { ...suppliedSource, src: curatedPhotoUrl(suppliedSource.photo, 720) }
    : suppliedSource;
  const key = source ? JSON.stringify(source) : "none";
  // Returning A → B → A is a new display lifecycle, even for identical URLs.
  const identity = useMemo(() => ({ key }), [key]);
  const activeKey = useRef(identity);
  useLayoutEffect(() => { activeKey.current = identity; }, [identity]);
  const [result, setResult] = useState<{ identity: typeof identity; state: "loaded" | "failed" } | null>(null);
  const failed = result?.identity === identity && result.state === "failed";
  const loaded = result?.identity === identity && result.state === "loaded";
  const resolve = (state: "loaded" | "failed") => {
    if (activeKey.current !== identity) return;
    // A late load after an error cannot restore exhausted media or its credit.
    setResult((previous) => previous?.identity === identity && previous.state === "failed"
      ? previous : { identity, state });
  };
  return <Context value={{ source, identity, loaded, failed, resolve }}>{children}</Context>;
}

export function SearchPlaceVisualImage({ fallback, size = 56, className = "", frame = "thumbnail" }: {
  fallback: ReactNode;
  size?: number;
  className?: string;
  frame?: "thumbnail" | "lead";
}) {
  const visual = useContext(Context);
  const source = visual?.source;
  const src = source ? placePhotoFailureSignalSrc(source.src) : null;
  const deferred = Boolean(frame === "lead" && source?.kind === "google" && !visual?.failed);
  const { frameRef, bytes } = useVisibleGooglePhoto(deferred ? src : null, deferred);
  useEffect(() => {
    if (deferred && bytes.status === "fallback") visual?.resolve("failed");
  }, [bytes.status, deferred, visual]);
  const reportLoad = (image: HTMLImageElement) => visual?.resolve(isPlacePhotoFailureSignal(image) ? "failed" : "loaded");
  return (
    <span ref={frameRef} aria-hidden className={`relative block shrink-0 overflow-hidden rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)] ${frame === "lead" ? styles.leadPhoto : ""} ${className}`}
      style={frame === "lead" ? undefined : { width: size, height: size }} data-search-place-visual={source?.kind ?? "none"}
      data-search-place-photo-frame={frame} data-search-place-photo-bytes={deferred ? bytes.status : undefined}>
      <span className="absolute inset-0 grid place-items-center">{fallback}</span>
      {source && src && !visual.failed && (deferred ? bytes.status === "ready" && (
        // The shared visible-byte transport owns this single no-store response.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`${visual.identity.key}:${bytes.objectUrl}`} src={bytes.objectUrl} alt="" className="absolute inset-0 h-full w-full object-cover"
          onError={() => visual.resolve("failed")} onLoad={(event) => reportLoad(event.currentTarget)} />
      ) : <Image key={visual.identity.key} src={src} alt="" fill
        sizes={frame === "lead" ? "(max-width: 640px) calc(100vw - 24px), 600px" : `${size}px`}
        unoptimized={source.kind === "google"} className="object-cover" loading="lazy"
        style={source.kind !== "google" ? { objectPosition: source.objectPosition } : undefined}
        onError={() => visual.resolve("failed")} onLoad={(event) => reportLoad(event.currentTarget)} />)}
    </span>
  );
}

/** One leading place keeps the real photograph, facts and explicit actions
 * together. Failed media collapses to the same compact factual header. */
export function SearchPlaceLead({ fallback, children, actions }: {
  fallback: ReactNode;
  children: ReactNode;
  actions: ReactNode;
}) {
  const visual = useContext(Context);
  const hasPhoto = Boolean(visual?.source && !visual.failed);
  return (
    <div className={styles.lead} data-search-place-lead data-has-photo={hasPhoto}>
      {hasPhoto && <SearchPlaceVisualImage frame="lead" fallback={null} />}
      <div className={styles.leadHeader}>
        {!hasPhoto && <SearchPlaceVisualImage size={48} fallback={fallback} />}
        <div>{children}</div>
      </div>
      <div className={styles.leadActions}>{actions}</div>
      <SearchPlaceVisualCredit />
    </div>
  );
}

export function SearchPlaceVisualCredit() {
  const visual = useContext(Context);
  if (!visual?.source || !visual.loaded || visual.failed) return null;
  return <PlaceCardPhotoCredit source={visual.source} loaded touchTarget />;
}
