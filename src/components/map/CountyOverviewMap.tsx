"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { prefersReducedData } from "@/lib/motion";
import {
  OVERVIEW_FRAME_PATH,
  OVERVIEW_VIEW_HEIGHT,
  OVERVIEW_VIEW_WIDTH,
  layoutOverviewLabels,
  type OverviewLabelSide,
} from "./countyOverview";
import type { CountyOverviewMapStatus } from "./CountyOverviewMapCanvas";

// MapLibre, its worker and the county tiles load only once the box nears the
// viewport, and never under Save-Data. The drawn outline and points do not
// wait for it.
const CountyOverviewMapCanvas = dynamic(() => import("./CountyOverviewMapCanvas"), {
  ssr: false,
});

/**
 * - `placeholder`: server render and every moment before the box nears the
 *   viewport. Also the lasting state under Save-Data.
 * - `loading`: MapLibre is mounted but has not drawn a complete frame.
 * - `ready`: the basemap is on screen under the outline and points.
 * - `unavailable`: no WebGL 2, or the basemap failed. The outline and points
 *   on paper stay as the honest final state.
 */
export type CountyOverviewStage = "placeholder" | "loading" | "ready" | "unavailable";

export type CountyOverviewPoint = {
  id: string;
  /** Position in overlay view units (projectOverview). */
  x: number;
  y: number;
  /** Map label, or null for a point drawn without one. */
  label: string | null;
  /** When set, the point and its label link here. */
  href?: string;
};

export type CountyOverviewArea = {
  id: string;
  /** overviewPath() of the area's polygon. */
  path: string;
};

/** Labels are laid out for this width until the box is measured: a 390px
 *  phone less its 16px gutters, the most common first render. */
export const OVERVIEW_DEFAULT_WIDTH = 358;

const NEAR_VIEWPORT_MARGIN = "240px 0px";

// Offsets mirror OVERVIEW_LABEL in countyOverview.ts: 8px beside the point,
// 6px from it on a diagonal.
const SIDE_CLASS: Record<OverviewLabelSide, string> = {
  right: "left-2 top-0 -translate-y-1/2",
  left: "right-2 top-0 -translate-y-1/2",
  above: "bottom-2 left-0 -translate-x-1/2",
  below: "left-0 top-2 -translate-x-1/2",
  "above-right": "bottom-1.5 left-1.5",
  "below-right": "left-1.5 top-1.5",
  "above-left": "bottom-1.5 right-1.5",
  "below-left": "right-1.5 top-1.5",
};

const DOT_TONE = {
  town: "bg-[color:var(--app-brand)]",
  park: "bg-[color:var(--app-brand-2)]",
} as const;

/**
 * CountyOverviewMap is a still picture of all of Frederick County: the
 * self-hosted MapLibre basemap inside the county line, Cream outside it, with
 * the caller's areas (municipal boundaries) and points (town centers, park
 * locations) drawn on top.
 *
 * The box is a fixed square in every state, so the basemap arriving never
 * moves the page, and the outline and points render on the server so the
 * picture is there before any map code loads. Nothing in here pans or zooms.
 *
 * Two ways in:
 * - points with an `href` (towns): each point and its label is a link. These
 *   are pointer shortcuts that repeat the page's own list, so they stay out of
 *   the tab order and the accessibility tree; the list is the keyboard path.
 * - `href` on the map (parks): the whole picture is one link, the "Open map"
 *   handoff to /map, and the points are marks only.
 */
export default function CountyOverviewMap({
  label,
  outline,
  areas = [],
  points,
  tone,
  caption,
  href,
  sourceCredit,
}: {
  /** Accessible description of the picture. */
  label: string;
  /** overviewPath() of the county outline. */
  outline: string;
  areas?: CountyOverviewArea[];
  /** In label priority order: earlier points keep their labels first. */
  points: CountyOverviewPoint[];
  tone: keyof typeof DOT_TONE;
  /** One line under the picture. */
  caption: ReactNode;
  /** Makes the whole picture one link (no per-point links then). */
  href?: string;
  /** Credit for the drawn data, e.g. "Boundaries: Frederick County GIS". */
  sourceCredit?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<CountyOverviewStage>("placeholder");
  const [width, setWidth] = useState(OVERVIEW_DEFAULT_WIDTH);

  useEffect(() => {
    if (stage !== "placeholder") return;
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

  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setWidth(next);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const handleStatus = useCallback((status: CountyOverviewMapStatus) => {
    setStage((current) => (current === "unavailable" ? current : status));
  }, []);

  const sides = useMemo(
    () =>
      layoutOverviewLabels(
        points.map((p) => ({ id: p.id, x: p.x, y: p.y, text: p.label })),
        width,
      ),
    [points, width],
  );

  const mapMounted = stage === "loading" || stage === "ready";
  const mapShown = stage === "ready";
  const linkedPoints = !href;
  const credits = [mapShown ? "Protomaps © OpenStreetMap" : null, sourceCredit ?? null]
    .filter(Boolean)
    .join(" · ");

  const figure = (
    <figure
      data-county-overview={stage}
      className="overflow-hidden rounded-[var(--app-radius-lg)] border border-[color:var(--app-border)] bg-[color:var(--app-bg)] text-[color:var(--app-ink)]"
    >
      <div
        ref={boxRef}
        className="relative aspect-square w-full overflow-hidden bg-[color:var(--app-bg-sunken)]"
      >
        <div role="img" aria-label={label} className="absolute inset-0">
          <div aria-hidden="true" className="absolute inset-0">
            {mapMounted ? (
              <div
                className={`absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${
                  mapShown ? "opacity-100" : "opacity-0"
                }`}
              >
                <CountyOverviewMapCanvas onStatus={handleStatus} />
              </div>
            ) : null}

            <svg
              viewBox={`0 0 ${OVERVIEW_VIEW_WIDTH} ${OVERVIEW_VIEW_HEIGHT}`}
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
            >
              {/* Cream outside the county line: the basemap shows the
                  county only, and the tile extract's edge never shows. */}
              <path
                data-overview-mask=""
                d={`${OVERVIEW_FRAME_PATH}${outline}`}
                fillRule="evenodd"
                className="fill-[color:var(--app-bg)]"
              />
              {areas.map((area) => (
                <path
                  key={area.id}
                  data-overview-area={area.id}
                  d={area.path}
                  strokeWidth={1.25}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  className="fill-[color:var(--app-cool-tint-14)] stroke-[color:var(--app-cool)]"
                />
              ))}
              <path
                d={outline}
                fill="none"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                className="stroke-[color:var(--app-ink-2)]"
              />
            </svg>
          </div>
        </div>

        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {points.map((point) => {
            const side = sides[point.id] ?? null;
            const style = {
              left: `${(point.x / OVERVIEW_VIEW_WIDTH) * 100}%`,
              top: `${(point.y / OVERVIEW_VIEW_HEIGHT) * 100}%`,
            };
            const marks = (
              <>
                <span
                  className={`absolute left-0 top-0 block h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color:var(--app-bg)] ${DOT_TONE[tone]} ${
                    linkedPoints && point.href ? "tap-44" : ""
                  }`}
                />
                {side && point.label ? (
                  <span
                    data-overview-label={side}
                    className={`absolute flex h-5 items-center whitespace-nowrap rounded-[var(--app-radius-sm)] border border-[color:var(--app-border)] bg-[color:var(--app-bg-elevated-solid)] px-1.5 text-caption font-semibold text-[color:var(--app-ink)] ${SIDE_CLASS[side]}`}
                  >
                    {point.label}
                  </span>
                ) : null}
              </>
            );
            return linkedPoints && point.href ? (
              <Link
                key={point.id}
                href={point.href}
                tabIndex={-1}
                data-overview-point={point.id}
                className="pointer-events-auto absolute"
                style={style}
              >
                {marks}
              </Link>
            ) : (
              <span key={point.id} data-overview-point={point.id} className="absolute" style={style}>
                {marks}
              </span>
            );
          })}
        </div>
      </div>

      <figcaption className="flex flex-col gap-0.5 border-t border-[color:var(--app-border)] px-3 py-2">
        <span className="flex min-h-6 items-center justify-between gap-3">
          <span className="min-w-0 text-meta text-[color:var(--app-ink-2)]">{caption}</span>
          {href ? (
            <span className="shrink-0 text-meta font-semibold text-[color:var(--app-brand-press)]">
              Open map <span aria-hidden="true">↗</span>
            </span>
          ) : null}
        </span>
        {credits ? (
          <span data-overview-credits="" className="text-caption text-[color:var(--app-ink-3)]">
            {credits}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );

  return href ? (
    <Link href={href} className="block rounded-[var(--app-radius-lg)]">
      {figure}
    </Link>
  ) : (
    figure
  );
}
