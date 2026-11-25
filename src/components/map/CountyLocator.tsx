import { useId, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import COUNTY from "@/data/county-boundary.json";
import { MUNICIPALITIES } from "@/data/municipalities";
import type { LngLat } from "@/lib/geo";
import styles from "./CountyLocator.module.css";

export type LocatorSelection = LngLat & {
  label: string;
  kind: "Selected place" | "Selected event" | "Starting point";
};
export type LocatorArea = { town?: string | null; point?: LocatorSelection | null };

// North-up equirectangular projection, scaled at the middle latitude of the
// published Census polygon. Project the boundary, town centres, graticule,
// scale and any selected point in exactly the same coordinate system.
const ring = COUNTY.coordinates[0];
const west = Math.min(...ring.map(([lng]) => lng));
const east = Math.max(...ring.map(([lng]) => lng));
const south = Math.min(...ring.map(([, lat]) => lat));
const north = Math.max(...ring.map(([, lat]) => lat));
const midLat = (south + north) / 2;
const midLng = (west + east) / 2;
const longitudeFactor = Math.cos(midLat * Math.PI / 180);
const unitsPerDegree = 211 / (north - south);
const project = (lng: number, lat: number) => ({
  x: +(174 + (lng - midLng) * longitudeFactor * unitsPerDegree).toFixed(2),
  y: +(125 - (lat - midLat) * unitsPerDegree).toFixed(2),
});
const countyPath = ring.map(([lng, lat], index) => {
  const { x, y } = project(lng, lat);
  return `${index === 0 ? "M" : "L"}${x} ${y}`;
}).join("") + "Z";
const miles5 = 5 * 1609.344 / 111195 * unitsPerDegree;
const labels: Record<string, { dx: number; dy: number; anchor?: "end" }> = {
  emmitsburg: { dx: 6, dy: -6 },
  thurmont: { dx: -7, dy: 4, anchor: "end" },
  walkersville: { dx: 7, dy: -4 },
  middletown: { dx: -7, dy: -6, anchor: "end" },
  frederick: { dx: 7, dy: 4 },
  brunswick: { dx: -7, dy: 7, anchor: "end" },
  "mount-airy": { dx: 6, dy: 5 },
};
const townPoints = MUNICIPALITIES.map((town) => ({ ...town, ...project(town.centroid.lng, town.centroid.lat) }));
const placeNames = townPoints.filter((town) => labels[town.slug]).map((town) => town.name).join(", ");

type LocatorCover = { title: string; href?: string; action?: string };

export default function CountyLocator({ town, point, cover }: LocatorArea & { cover?: LocatorCover }) {
  const id = useId();
  const center = townPoints.find((item) => item.slug === town || item.name === town);
  const selected = point && Number.isFinite(point.lng) && Number.isFinite(point.lat) ? point : null;
  const focus = selected ? project(selected.lng, selected.lat) : center;
  const shown = focus && focus.x >= 12 && focus.x <= 336 && focus.y >= 10 && focus.y <= 242;
  const name = selected?.label ?? center?.name;
  const kind = selected?.kind ?? "Town center";
  const context = name
    ? `${kind}: ${name}${shown ? "" : " (outside this view)"}`
    : "Frederick County, Maryland";
  return (
    <figure className={`${styles.figure}${cover ? ` ${styles.cover}` : ""}`} data-county-locator>
      <figcaption className={styles.caption}>
        <span className={styles.label}>{cover ? "County map" : "County locator"}</span>
        <span className={styles.name}>{shown && <span className={styles.selectedKey} aria-hidden="true" />}{cover?.title ?? context}</span>
        {cover?.href && cover.action && <Link prefetch={false} className={styles.coverLink} href={cover.href}>
          {cover.action}<ArrowUpRight aria-hidden="true" size={15} />
        </Link>}
      </figcaption>
      <svg viewBox="0 0 348 250" preserveAspectRatio="xMidYMid meet" className={styles.map}
        role="img" aria-labelledby={`${id}-title ${id}-desc`}>
        <title id={`${id}-title`}>Frederick County reference map</title>
        <desc id={`${id}-desc`}>This north-up overview marks town centers. Emmitsburg and Thurmont are north of Frederick City. Brunswick lies southwest and Mount Airy lies east. Labeled towns: {placeNames}. {name && `${context}.`}</desc>
        <g className={styles.grid} aria-hidden="true">
          {[-77.6, -77.4, -77.2].map((lng) => <line key={lng} x1={project(lng, midLat).x} x2={project(lng, midLat).x} y1="8" y2="240" />)}
          {[39.3, 39.5, 39.7].map((lat) => <line key={lat} y1={project(midLng, lat).y} y2={project(midLng, lat).y} x1="9" x2="339" />)}
        </g>
        <path d={countyPath} className={styles.boundary} />
        <g aria-hidden="true" className={styles.coordinate}>
          <text x={project(-77.4, midLat).x - 4} y="11" textAnchor="end">77.4° W</text>
          <text x="10" y={project(midLng, 39.5).y - 3}>39.5° N</text>
        </g>
        {townPoints.map((item) => {
          const offset = labels[item.slug];
          return <g key={item.slug} transform={`translate(${item.x} ${item.y})`}>
            <circle r={item.slug === "frederick" ? 3.6 : 2.15} className={styles.town} />
            {offset && <text x={offset.dx} y={offset.dy} textAnchor={offset.anchor ?? "start"} className={styles.townName}>{item.name}</text>}
          </g>;
        })}
        {shown && focus && <g transform={`translate(${focus.x} ${focus.y})`} data-locator-selection={kind}>
          <circle r="6.25" className={styles.mark} />
          <circle r="2.2" className={styles.markCore} />
        </g>}
        <g transform="translate(322 16)" className={styles.key} aria-hidden="true">
          <text y="0" textAnchor="middle">N</text>
          <path d="M0 5 L3.6 17 L0 14 L-3.6 17 Z" fill="currentColor" />
        </g>
        <g transform="translate(12 230)" className={styles.key} aria-hidden="true">
          <path d={`M0 0 V4 H${miles5.toFixed(2)} V0`} fill="none" stroke="currentColor" strokeWidth="1.5" />
          <text x={miles5 / 2} y="-3" textAnchor="middle">5 mi</text>
        </g>
      </svg>
      <span className={styles.source}>Generalized boundary · U.S. Census Bureau</span>
    </figure>
  );
}

export function CountyLocatorWorkspace({ area, children, resultsFirst = false }: {
  area: LocatorArea;
  children: ReactNode;
  resultsFirst?: boolean;
}) {
  const results = <div className={styles.results}>{children}</div>;
  return <div className={styles.workspace}>
    {resultsFirst && results}
    <div className={styles.atlas}><CountyLocator {...area} /></div>
    {!resultsFirst && results}
  </div>;
}
