"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { Expand } from "lucide-react";
import PhotoLightbox from "@/components/ui/PhotoLightbox";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { PlaceCardPhotoCredit } from "@/components/place/PlaceCardPhoto";
import {
  isPlacePhotoFailureSignal, recordPlaceCardPhotoResult, selectedPlaceCardPhoto,
  type PlaceCardPhotoPlan, type PlaceCardPhotoSource, type PlaceCardPhotoState,
} from "@/lib/place-card-photo";

// Keep existing MapPeek and source-contract imports compatible. The utility
// lives in the photo library so the hero can open the viewer without a cycle.
export { isPlacePhotoFailureSignal, placePhotoFailureSignalSrc } from "@/lib/place-card-photo";

/** Own both the image and its geometry: an exhausted plan cannot leave a
 * full-height photo placeholder. The server-supplied plate stays behind it. */
export default function PlaceHeroMedia({
  plan, name, aspectRatio, width, height, size, priority,
  skyTop, skyBottom, golden, children,
}: {
  plan: PlaceCardPhotoPlan;
  name: string;
  aspectRatio: "16/10" | "16/9" | "4/3" | "1/1";
  width: number;
  height: number;
  size: "card" | "hero";
  priority: boolean;
  googleMapsUri?: string;
  skyTop?: string;
  skyBottom?: string;
  golden: boolean;
  children: ReactNode;
}) {
  const [state, setState] = useState<PlaceCardPhotoState | null>(null);
  const [viewer, setViewer] = useState<{ source: PlaceCardPhotoSource; name: string } | null>(null);
  const source = selectedPlaceCardPhoto(plan, state);
  const loaded = Boolean(source && state?.planKey === plan.key && state.loadedSrc === source.src);
  const image = source ? (
    <Image key={source.src} src={source.src} alt={source.alt || name}
      width={width} height={height} unoptimized={source.kind === "google"}
      priority={priority} fetchPriority={priority ? "high" : "auto"}
      sizes={size === "hero" ? "(max-width: 720px) 100vw, 720px" : "(max-width: 720px) 50vw, 360px"}
      placeholder="blur" blurDataURL={PAPER_CREAM_BLUR}
      className={`absolute inset-0 z-0 h-full w-full object-cover${size === "hero" ? ` ken-burns${loaded ? " ken-burns-ready" : ""}` : ""}`}
      onLoad={(event) => {
        const result = isPlacePhotoFailureSignal(event.currentTarget) ? "failed" : "loaded";
        setState((current) => recordPlaceCardPhotoResult(plan, current, source.src, result));
      }}
      onError={() => setState((current) => recordPlaceCardPhotoResult(plan, current, source.src, "failed"))} />
  ) : null;
  return (
    <>
      <div data-place-hero data-place-hero-size={size}
        data-place-hero-source={source?.kind ?? "none"}
        data-place-photo-failed={!source && plan.sources.length > 0 || undefined}
        className={`relative w-full overflow-hidden${size === "hero" && source ? " max-h-[38vh]" : ""}`}
        style={source ? { aspectRatio } : { height: size === "hero" ? 148 : 96 }}>
        {children}
        {source && size === "hero" ? (
          <button type="button" aria-label={`View ${name} photo`} aria-haspopup="dialog"
            aria-busy={!loaded}
            className="group absolute inset-0 z-0 h-full w-full cursor-zoom-in overflow-hidden border-0 p-0 text-left focus-visible:outline-none"
            onClick={() => setViewer({ source, name })}>
            {image}
            <span aria-hidden className="pointer-events-none absolute inset-1 z-20 rounded-sm border-2 border-transparent group-focus-visible:border-[var(--app-brand)]" />
            <span aria-hidden className="pointer-events-none absolute bottom-3 right-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm">
              <Expand className="h-3.5 w-3.5" /> View photo
            </span>
          </button>
        ) : image}
        {source && skyTop && skyBottom && (
          <>
            <div aria-hidden className="pointer-events-none absolute inset-0 z-10"
              style={{ mixBlendMode: "soft-light", background: `linear-gradient(165deg, color-mix(in srgb, ${skyTop} 24%, transparent) 0%, transparent 46%, color-mix(in srgb, ${skyBottom} 32%, transparent) 100%)` }} />
            {golden && <div aria-hidden className="pointer-events-none absolute inset-0 z-10"
              style={{ background: "radial-gradient(120% 80% at 85% 8%, color-mix(in srgb, var(--app-brand) 16%, transparent) 0%, transparent 60%)" }} />}
          </>
        )}
      </div>
      <PlaceCardPhotoCredit source={source} loaded={loaded} />
      {/* Keep the chosen source until explicit dismissal. A hero load/error
          must not unmount a viewer that owns its own history/failure state. */}
      {viewer && (
        <PhotoLightbox key={viewer.source.src} sources={[viewer.source]} alt={viewer.name}
          onClose={() => setViewer(null)} />
      )}
    </>
  );
}
