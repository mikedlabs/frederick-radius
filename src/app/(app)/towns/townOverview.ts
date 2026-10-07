import COUNTY_OUTLINE from "@/data/county-boundary.json";
import { MUNICIPALITIES } from "@/data/municipalities";
import type { MapLineFC } from "@/components/map/types";
import { overviewPath, projectOverview } from "@/components/map/countyOverview";
import type {
  CountyOverviewArea,
  CountyOverviewPoint,
} from "@/components/map/CountyOverviewMap";
import type { TownLocator } from "@/components/town/TownPicker";

export type TownOverview = {
  /** County outline at overview detail. */
  outline: string;
  /** A coarser county outline for the card tiles, which are a third the size. */
  tileOutline: string;
  areas: CountyOverviewArea[];
  /** Largest town first, so the busiest places keep their labels. */
  points: CountyOverviewPoint[];
  /** Per town; `path` is null when the County GIS layer had no polygon
   *  (Urbana is unincorporated, and the live layer can be unavailable). */
  locators: Record<string, TownLocator>;
};

/**
 * Everything /towns draws, projected once on the server.
 *
 * All 13 towns get a point at their center, so Urbana (which has no municipal
 * boundary) and every town on a day the County GIS layer is down still appear.
 * Areas come only from the official boundaries: a town with no polygon gets
 * no outline rather than a guessed one.
 */
export function townOverview(boundaries: MapLineFC): TownOverview {
  const pathsBySlug = new Map<string, string>();
  for (const feature of boundaries.features) {
    const slug = String(feature.properties?.slug ?? "");
    if (!slug) continue;
    const path = overviewPath(feature.geometry);
    if (!path) continue;
    pathsBySlug.set(slug, `${pathsBySlug.get(slug) ?? ""}${path}`);
  }

  const known = new Set(MUNICIPALITIES.map((m) => m.slug));
  const areas: CountyOverviewArea[] = [...pathsBySlug.entries()]
    .filter(([slug]) => known.has(slug))
    .map(([slug, path]) => ({ id: slug, path }));

  const byPriority = [...MUNICIPALITIES].sort((a, b) => b.population - a.population);
  const points: CountyOverviewPoint[] = byPriority.map((m) => ({
    id: m.slug,
    ...projectOverview(m.centroid.lng, m.centroid.lat),
    label: m.name,
    href: `/m/${m.slug}`,
  }));

  const locators: Record<string, TownLocator> = {};
  for (const m of MUNICIPALITIES) {
    locators[m.slug] = {
      ...projectOverview(m.centroid.lng, m.centroid.lat),
      path: pathsBySlug.get(m.slug) ?? null,
    };
  }

  return {
    outline: overviewPath(COUNTY_OUTLINE),
    // About 2px between kept vertices on a phone-width card tile.
    tileOutline: overviewPath(COUNTY_OUTLINE, 12),
    areas,
    points,
    locators,
  };
}
