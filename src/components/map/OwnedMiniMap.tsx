"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedData } from "@/lib/motion";
import type { OwnedMiniMapStatus } from "./OwnedMiniMapCanvas";

// MapLibre, its worker, and the county tiles load only after the box nears
// the viewport. A place page that is never scrolled to Location pays nothing.
const OwnedMiniMapCanvas = dynamic(() => import("./OwnedMiniMapCanvas"), {
  ssr: false,
});

/**
 * - `placeholder`: server render and every moment before the box nears the
 *   viewport. Also the lasting state under Save-Data.
 * - `loading`: MapLibre is mounted but has not drawn a complete frame.
 * - `ready`: the basemap is on screen.
 * - `unavailable`: no WebGL 2, or the basemap failed to start. The Cream
 *   placeholder stays as the honest final state.
 */
export type OwnedMiniMapStage = "placeholder" | "loading" | "ready" | "unavailable";

/** Far enough ahead that a normal scroll never reaches an empty box. */
const NEAR_VIEWPORT_MARGIN = "240px 0px";

/**
 * OwnedMiniMap is a still map of the block around a place or venue, drawn from
 * the self-hosted county basemap with a Brick pin at its center.
 *
 * The box is a fixed height in every state, so swapping the placeholder for
 * the map never moves the page. The pin is one element shared by both states
 * and sits on the exact camera center, so it does not jump when the map
 * arrives. The caller wraps this in the "Open map" link; nothing in here is
 * interactive, which is why the basemap credit is plain text.
 */
export default function OwnedMiniMap({
  lng,
  lat,
  zoom,
  name,
  address,
}: {
  lng: number;
  lat: number;
  zoom: number;
  /** Place or venue name, for the caption and the accessible name. */
  name: string;
  /** Street address shown on the placeholder while the map is not drawn. */
  address?: string | null;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<OwnedMiniMapStage>("placeholder");

  useEffect(() => {
    if (stage !== "placeholder") return;
    // Save-Data asked us not to spend bandwidth on a picture the address and
    // the "Open map" handoff already cover.
    if (prefersReducedData()) return;

    const box = boxRef.current;
    if (!box || typeof IntersectionObserver === "undefined") {
      const start = window.setTimeout(() => setStage("loading"), 0);
      return () => window.clearTimeout(start);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setStage("loading");
      },
      { rootMargin: NEAR_VIEWPORT_MARGIN },
    );
    observer.observe(box);
    return () => observer.disconnect();
  }, [stage]);

  const handleStatus = useCallback((status: OwnedMiniMapStatus) => {
    // A map that failed stays failed; a late load event cannot revive it.
    setStage((current) => (current === "unavailable" ? current : status));
  }, []);

  const mapMounted = stage === "loading" || stage === "ready";
  const mapShown = stage === "ready";
  const trimmedAddress = address?.trim() || null;
  const label = mapShown
    ? `Map of the area around ${name}`
    : trimmedAddress
      ? `Location of ${name}, ${trimmedAddress}`
      : `Location of ${name}`;

  return (
    <div
      ref={boxRef}
      data-owned-mini-map={stage}
      className="relative h-44 w-full overflow-hidden bg-[color:var(--app-bg)] text-[color:var(--app-ink)]"
    >
      <div role="img" aria-label={label} className="absolute inset-x-0 bottom-10 top-0">
        <div aria-hidden="true" className="absolute inset-0">
          {mapMounted ? (
            <div
              className={`absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${
                mapShown ? "opacity-100" : "opacity-0"
              }`}
            >
              <OwnedMiniMapCanvas lng={lng} lat={lat} zoom={zoom} onStatus={handleStatus} />
            </div>
          ) : null}

          {!mapShown && trimmedAddress ? (
            <p
              data-mini-map-address="true"
              className="absolute inset-x-4 top-1/2 mt-2 line-clamp-2 text-center text-xs leading-snug text-[color:var(--app-ink-2)]"
            >
              {trimmedAddress}
            </p>
          ) : null}

          {/* Tip on the camera center: the path's point is the box's bottom edge. */}
          <svg
            viewBox="0 0 26 32"
            className="absolute left-1/2 top-1/2 h-8 w-[26px] -translate-x-1/2 -translate-y-full overflow-visible"
          >
            <path
              d="M13 31C13 31 2 21.6 2 12.5a11 11 0 0 1 22 0C24 21.6 13 31 13 31Z"
              strokeWidth="2"
              strokeLinejoin="round"
              className="fill-[color:var(--app-brand)] stroke-[color:var(--app-bg)]"
            />
            <circle cx="13" cy="12.5" r="4" className="fill-[color:var(--app-bg)]" />
          </svg>

          {mapShown ? (
            <span className="absolute bottom-1 right-1 rounded-[var(--app-radius-sm)] bg-[color:var(--app-bg)]/85 px-1.5 py-0.5 text-[10px] leading-none text-[color:var(--app-ink-2)]">
              Protomaps © OpenStreetMap
            </span>
          ) : null}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex h-10 items-center justify-between gap-3 border-t border-[color:var(--app-border)] bg-[color:var(--app-bg)] px-3">
        <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
        <span className="shrink-0 text-xs font-semibold text-[color:var(--app-brand)]">
          Open map <span aria-hidden="true">↗</span>
        </span>
      </div>
    </div>
  );
}
