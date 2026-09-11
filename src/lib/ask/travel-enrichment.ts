import "server-only";

import type { LngLat } from "@/lib/geo";
import type { AskResult } from "@/lib/ask/contracts";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import {
  getAskTravelTimes,
  type AskTravelCandidate,
  type AskTravelMode,
  type AskTravelTimesResult,
} from "@/lib/ask/mapbox-travel";

const CYCLING_RE = /\b(?:bike|biking|bicycle|cycling|cycle)\b/i;
const DRIVING_RE = /\b(?:drive|driving|by car|traffic|road time)\b/i;
const WALKING_RE = /\b(?:walk|walking|walkable|on foot|less walking|shortest walk)\b/i;
const PROXIMITY_RE = /\b(?:near me|nearest|closest|closest to me)\b/i;

export function askTravelModeForQuery(query: string): AskTravelMode | null {
  if (CYCLING_RE.test(query)) return "cycling";
  if (DRIVING_RE.test(query)) return "driving";
  if (WALKING_RE.test(query) || PROXIMITY_RE.test(query)) return "walking";
  return null;
}

type ResolvePlace = (
  slug: string,
) => Pick<AskTravelCandidate, "slug" | "name" | "geom"> | null | undefined;

type TravelLookup = (input: {
  origin: LngLat;
  candidates: AskTravelCandidate[];
  mode: AskTravelMode;
  timeoutMs?: number;
}) => Promise<AskTravelTimesResult>;

/**
 * Add routed evidence to grounded Ask source cards when the visitor explicitly
 * asks about proximity or a travel mode.
 *
 * This intentionally does not rewrite the answer or reorder editorial picks.
 * Mapbox supplies a measurable travel-time receipt; Radius still owns which
 * places are eligible and why they were recommended.
 */
export async function enrichAskResultWithTravelTimes(
  result: AskResult,
  query: string,
  origin: LngLat | null,
  options: {
    timeoutMs?: number;
    resolvePlace?: ResolvePlace;
    lookup?: TravelLookup;
  } = {},
): Promise<AskResult> {
  const mode = askTravelModeForQuery(query);
  if (!origin || !mode || result.sources.length < 2) return result;

  const resolvePlace = options.resolvePlace ?? clientPlaceBySlug;
  const candidates = result.sources.flatMap((source): AskTravelCandidate[] => {
    if (!source.href.startsWith("/places/")) return [];
    const place = resolvePlace(source.href.slice("/places/".length));
    return place ? [{ slug: place.slug, name: place.name, geom: place.geom }] : [];
  });
  if (candidates.length < 2) return result;

  const lookup = options.lookup ?? getAskTravelTimes;
  const travel = await lookup({
    origin,
    candidates,
    mode,
    timeoutMs: options.timeoutMs,
  });
  if (!travel.available) return result;

  const routeBySlug = new Map(
    travel.routes.map((route) => [route.slug, route] as const),
  );
  const sources = result.sources.map((source) => {
    const route = routeBySlug.get(source.slug);
    return route ? { ...source, distance: route.label } : source;
  });
  const intelligence = result.intelligence
    ? {
        ...result.intelligence,
        tools: Array.from(
          new Set([...result.intelligence.tools, "mapbox-travel"]),
        ),
      }
    : result.intelligence;

  return { ...result, sources, intelligence };
}
