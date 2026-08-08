import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { haversineMeters, type LngLat } from "@/lib/geo";
import type { SearchResult } from "@/lib/search/index";
import type { MapPinPlace } from "./types";

function normalizePlaceName(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const NAME_CONNECTORS = new Set(["and", "the", "at"]);

function significantNameWords(value: string): string[] {
  return normalizePlaceName(value)
    .split(" ")
    .filter((word) => word && !NAME_CONNECTORS.has(word));
}

export type MapPlaceNameConfidence =
  | "none"
  | "words"
  | "phrase"
  | "prefix"
  | "exact";

const CONFIDENCE_RANK: Record<MapPlaceNameConfidence, number> = {
  none: 0,
  words: 1,
  phrase: 2,
  prefix: 3,
  exact: 4,
};

/**
 * Name-only confidence used by the map's already-loaded local catalog.
 * Connectors are ignored for equality so "Gravel & Grind" and
 * "gravel grind" describe the same destination, while an arbitrary shared
 * fragment remains a weak match.
 */
export function mapPlaceNameConfidence(
  title: string,
  query: string,
): MapPlaceNameConfidence {
  const normalizedTitle = normalizePlaceName(title);
  const normalizedQuery = normalizePlaceName(query);
  if (!normalizedTitle || normalizedQuery.length < 3) return "none";

  const titleWords = significantNameWords(title);
  const queryWords = significantNameWords(query);
  if (
    normalizedTitle === normalizedQuery ||
    (queryWords.length > 0 && titleWords.join(" ") === queryWords.join(" "))
  ) {
    return "exact";
  }
  if (
    normalizedTitle.startsWith(normalizedQuery) ||
    (queryWords.length > 0 &&
      queryWords.length <= titleWords.length &&
      queryWords.every((word, index) => titleWords[index]?.startsWith(word)))
  ) {
    return "prefix";
  }
  if (normalizedTitle.includes(normalizedQuery)) return "phrase";
  if (
    queryWords.length > 0 &&
    queryWords.every((word) =>
      titleWords.some((titleWord) => titleWord.startsWith(word)),
    )
  ) {
    return "words";
  }
  return "none";
}

/** An exact match always wins. A prefix is only confident when it identifies
 * one local place, preventing a short phrase such as "Gravel" from silently
 * choosing between several businesses. */
export function confidentLocalMapPlaceResult(
  results: readonly SearchResult[],
  query: string,
): SearchResult | null {
  const localPlaces = results
    .filter((result) => result.type === "place" && !result.temporary)
    .map((result) => ({
      result,
      confidence: mapPlaceNameConfidence(result.title, query),
    }));
  const exact = localPlaces.find((entry) => entry.confidence === "exact");
  if (exact) return exact.result;

  const normalizedQuery = normalizePlaceName(query);
  const prefixes = localPlaces.filter(
    (entry) => entry.confidence === "prefix",
  );
  return normalizedQuery.length >= 4 && prefixes.length === 1
    ? prefixes[0]?.result ?? null
    : null;
}

/**
 * Keep the canonical local place when the server enrichment arrives. Under a
 * confident exact/prefix hit, unrelated word-fragment place results are map
 * noise, but event/action/category results remain available when useful.
 */
export function reconcileMapSearchResults(
  immediate: readonly SearchResult[],
  server: readonly SearchResult[],
  query: string,
  limit = 6,
): SearchResult[] {
  const confident = confidentLocalMapPlaceResult(immediate, query);
  const liveLocalById = new Map(immediate.map((result) => [result.id, result]));
  const ordered = confident
    ? [
        confident,
        ...server,
        ...immediate.filter((result) => result.id !== confident.id),
      ]
    : [...server, ...immediate];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const merged: SearchResult[] = [];

  for (const candidate of ordered) {
    const liveLocal = liveLocalById.get(candidate.id);
    // The API intentionally receives a rounded coordinate. Keep its richer
    // ranking and copy, but preserve the browser's exact distance so the
    // result row and the selected-place card cannot disagree by a block.
    const result =
      candidate.type === "place" && liveLocal?.distance_m != null
        ? {
            ...candidate,
            distance_m: liveLocal.distance_m,
            lat: liveLocal.lat ?? candidate.lat,
            lng: liveLocal.lng ?? candidate.lng,
          }
        : candidate;
    if (confident && result.type === "place" && result.id !== confident.id) {
      const confidence = mapPlaceNameConfidence(result.title, query);
      if (CONFIDENCE_RANK[confidence] < CONFIDENCE_RANK.phrase) continue;
    }
    const nameKey = `${result.type}:${normalizePlaceName(result.title)}`;
    if (seenIds.has(result.id) || seenNames.has(nameKey)) continue;
    seenIds.add(result.id);
    seenNames.add(nameKey);
    merged.push(result);
    if (merged.length >= Math.max(0, limit)) break;
  }
  return merged;
}

/**
 * Give known Radius businesses an immediate map result while the canonical
 * search endpoint adds categories, events, actions, and richer ranking. This
 * intentionally matches names only: broad intent such as "coffee" still
 * belongs to the server search and never gets a misleading partial answer.
 */
export function immediateMapPlaceResults(
  places: readonly MapPinPlace[],
  query: string,
  origin: LngLat | null,
  limit = 6,
): SearchResult[] {
  const normalizedQuery = normalizePlaceName(query);
  if (normalizedQuery.length < 3) return [];

  return places
    .map((place) => {
      const confidence = mapPlaceNameConfidence(place.name, query);
      if (confidence === "none") return null;

      const distance = origin
        ? haversineMeters(origin, place.geom)
        : undefined;
      const nameRank = 4 - CONFIDENCE_RANK[confidence];
      const category = CATEGORY_BY_SLUG[place.category]?.name ?? place.category;
      const municipality =
        MUNICIPALITY_BY_SLUG[place.municipality]?.name ?? place.municipality;

      return {
        rank: nameRank,
        distance: distance ?? Infinity,
        result: {
          type: "place" as const,
          id: `place:${place.slug}`,
          title: place.name,
          subtitle: [category, municipality].filter(Boolean).join(" · "),
          href: `/places/${place.slug}`,
          lat: place.geom.lat,
          lng: place.geom.lng,
          distance_m: distance,
        } satisfies SearchResult,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.distance - b.distance ||
        a.result.title.localeCompare(b.result.title),
    )
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.result);
}
