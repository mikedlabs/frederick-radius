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

/** One numbered pin on a results map. */
export type OwnedMiniMapPin = {
  lng: number;
  lat: number;
  /** The number this pin shares with its row in the list ("1", "2"). */
  label: string;
  /** Read aloud in the map's accessible name. */
  name: string;
};

type OwnedMiniMapCommonProps = {
  /** Place or venue name (or what the pins are), for the accessible name. */
  name: string;
  /** Street address shown on the placeholder while the map is not drawn. */
  address?: string | null;
};

/** The original single-pin map of one place's block, framed by its caller. */
type OwnedMiniMapSinglePinProps = OwnedMiniMapCommonProps & {
  lng: number;
  lat: number;
  zoom: number;
  pins?: undefined;
};

/**
 * Several numbered pins, framed so every pin fits. This variant has no
 * caption bar and no "Open map" promise because its callers (Ask's ranked
 * results) do not wrap it in a link.
 */
type OwnedMiniMapPinsProps = OwnedMiniMapCommonProps & {
  pins: readonly OwnedMiniMapPin[];
  lng?: undefined;
  lat?: undefined;
  zoom?: undefined;
};

export type OwnedMiniMapProps = OwnedMiniMapSinglePinProps | OwnedMiniMapPinsProps;

/** MapLibre's world is 512 CSS pixels wide at zoom 0. */
const WORLD_PX = 512;
/** The box height (h-44). The pins variant draws the map over all of it. */
const BOX_HEIGHT_PX = 176;
/**
 * The narrowest column the box ever gets: a 320 px phone with 16 px gutters.
 * Framing for it keeps every pin inside wider boxes too, and a fixed frame
 * means the pins never move between the server render and the map.
 */
const FIT_WIDTH_PX = 288;
/** Room for a 26 x 32 pin above its tip, beside it, and for the credit. */
const PIN_PAD_X = 21;
const PIN_PAD_TOP = 38;
const PIN_PAD_BOTTOM = 18;
/** Wide enough for the whole county. */
const PINS_MIN_ZOOM = 8;
/** Never closer than the place-page block (MINI_MAP_ZOOM), even for one pin. */
const PINS_MAX_ZOOM = 15.5;

function mercatorX(lng: number): number {
  return (lng + 180) / 360;
}

function mercatorY(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
}

function lngFromMercatorX(x: number): number {
  return x * 360 - 180;
}

function latFromMercatorY(y: number): number {
  const n = Math.PI - 2 * Math.PI * y;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export type MiniMapPinsCamera = {
  lng: number;
  lat: number;
  zoom: number;
  /** Each pin's tip in CSS pixels from the box center, in input order. */
  offsets: Array<{ x: number; y: number }>;
};

/**
 * One camera that fits every pin, plus where each pin's tip lands relative to
 * the box center. MapLibre receives the same center and zoom, so the pins
 * drawn here sit on the same streets as the basemap under them.
 */
export function miniMapPinsCamera(
  pins: ReadonlyArray<Pick<OwnedMiniMapPin, "lng" | "lat">>,
  frame: { width?: number; height?: number; maxZoom?: number } = {},
): MiniMapPinsCamera {
  const width = frame.width ?? FIT_WIDTH_PX;
  const height = frame.height ?? BOX_HEIGHT_PX;
  const maxZoom = frame.maxZoom ?? PINS_MAX_ZOOM;
  const xs = pins.map((pin) => mercatorX(pin.lng));
  const ys = pins.map((pin) => mercatorY(pin.lat));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const usableWidth = Math.max(1, width - PIN_PAD_X * 2);
  const usableHeight = Math.max(1, height - PIN_PAD_TOP - PIN_PAD_BOTTOM);
  const fitZoom = (span: number, room: number) =>
    span > 0 ? Math.log2(room / (span * WORLD_PX)) : Number.POSITIVE_INFINITY;
  const zoom =
    Math.floor(
      Math.max(
        PINS_MIN_ZOOM,
        Math.min(
          maxZoom,
          fitZoom(maxX - minX, usableWidth),
          fitZoom(maxY - minY, usableHeight),
        ),
      ) * 100,
    ) / 100;
  const scale = WORLD_PX * 2 ** zoom;
  const centerX = (minX + maxX) / 2;
  // The pins rise above their tips, so the band of tips sits a little below
  // the middle of the box to leave the top padding for the pin heads.
  const centerY = (minY + maxY) / 2 - (PIN_PAD_TOP - PIN_PAD_BOTTOM) / 2 / scale;
  return {
    lng: lngFromMercatorX(centerX),
    lat: latFromMercatorY(centerY),
    zoom,
    offsets: pins.map((_, index) => ({
      x: Math.round((xs[index] - centerX) * scale * 10) / 10,
      y: Math.round((ys[index] - centerY) * scale * 10) / 10,
    })),
  };
}

/**
 * The Brick pin with its tip on (x, y) from the box center. A numbered pin
 * carries the row number in Cream; the single place pin keeps its Cream dot.
 */
function MiniMapPin({
  x = 0,
  y = 0,
  label,
}: {
  x?: number;
  y?: number;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 26 32"
      data-mini-map-pin={label ?? ""}
      className="absolute h-8 w-[26px] -translate-x-1/2 -translate-y-full overflow-visible"
      style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}
    >
      <path
        d="M13 31C13 31 2 21.6 2 12.5a11 11 0 0 1 22 0C24 21.6 13 31 13 31Z"
        strokeWidth="2"
        strokeLinejoin="round"
        className="fill-[color:var(--app-brand)] stroke-[color:var(--app-bg)]"
      />
      {label ? (
        <text
          x="13"
          y="12.5"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="11"
          fontWeight="700"
          className="fill-[color:var(--app-bg)] tabular-nums"
        >
          {label}
        </text>
      ) : (
        <circle cx="13" cy="12.5" r="4" className="fill-[color:var(--app-bg)]" />
      )}
    </svg>
  );
}

/**
 * OwnedMiniMap is a still map from the self-hosted county basemap. It draws
 * either the block around one place or venue with a Brick pin at its center,
 * or several numbered Brick pins that match a ranked list.
 *
 * The box is a fixed height in every state, so swapping the placeholder for
 * the map never moves the page. Pins are drawn here, not by MapLibre, so they
 * are on screen in every state and do not jump when the map arrives. The
 * single-pin caller wraps this in the "Open map" link; nothing in here is
 * interactive, which is why the basemap credit is plain text.
 */
export default function OwnedMiniMap(props: OwnedMiniMapProps) {
  const { name, address } = props;
  const boxRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<OwnedMiniMapStage>("placeholder");
  const pins = props.pins ?? null;
  const noPins = Boolean(pins && pins.length === 0);
  const pinsCamera = pins && pins.length > 0 ? miniMapPinsCamera(pins) : null;
  const camera = pinsCamera ?? {
    lng: props.lng ?? 0,
    lat: props.lat ?? 0,
    zoom: props.zoom ?? PINS_MAX_ZOOM,
  };

  useEffect(() => {
    if (stage !== "placeholder" || noPins) return;
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
  }, [stage, noPins]);

  const handleStatus = useCallback((status: OwnedMiniMapStatus) => {
    // A map that failed stays failed; a late load event cannot revive it.
    setStage((current) => (current === "unavailable" ? current : status));
  }, []);

  if (noPins) return null;

  const mapMounted = stage === "loading" || stage === "ready";
  const mapShown = stage === "ready";
  const trimmedAddress = address?.trim() || null;
  const label = pins
    ? `${mapShown ? `Map of ${name}` : `Locations of ${name}`}: ${pins
        .map((pin) => `${pin.label} ${pin.name}`)
        .join(", ")}`
    : mapShown
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
      <div
        role="img"
        aria-label={label}
        className={`absolute inset-x-0 top-0 ${pins ? "bottom-0" : "bottom-10"}`}
      >
        <div aria-hidden="true" className="absolute inset-0">
          {mapMounted ? (
            <div
              className={`absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${
                mapShown ? "opacity-100" : "opacity-0"
              }`}
            >
              <OwnedMiniMapCanvas
                lng={camera.lng}
                lat={camera.lat}
                zoom={camera.zoom}
                onStatus={handleStatus}
              />
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

          {pins && pinsCamera ? (
            // The first result is drawn last so it stays on top of a cluster.
            pins
              .map((pin, index) => ({ pin, offset: pinsCamera.offsets[index] }))
              .reverse()
              .map(({ pin, offset }) => (
                <MiniMapPin
                  key={`${pin.label}-${pin.lng}-${pin.lat}`}
                  x={offset.x}
                  y={offset.y}
                  label={pin.label}
                />
              ))
          ) : (
            // Tip on the camera center: the path's point is the box's bottom edge.
            <MiniMapPin />
          )}

          {mapShown ? (
            <span className="absolute bottom-1 right-1 rounded-[var(--app-radius-sm)] bg-[color:var(--app-bg)]/85 px-1.5 py-0.5 text-[10px] leading-none text-[color:var(--app-ink-2)]">
              Protomaps © OpenStreetMap
            </span>
          ) : null}
        </div>
      </div>

      {pins ? null : (
        <div className="absolute inset-x-0 bottom-0 flex h-10 items-center justify-between gap-3 border-t border-[color:var(--app-border)] bg-[color:var(--app-bg)] px-3">
          <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
          <span className="shrink-0 text-xs font-semibold text-[color:var(--app-brand)]">
            Open map <span aria-hidden="true">↗</span>
          </span>
        </div>
      )}
    </div>
  );
}
