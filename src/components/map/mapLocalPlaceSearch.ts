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
  const queryWords = normalizedQuery.split(" ");

  return places
    .map((place) => {
      const normalizedName = normalizePlaceName(place.name);
      const matchesPhrase = normalizedName.includes(normalizedQuery);
      const matchesWords = queryWords.every((word) =>
        normalizedName.split(" ").some((nameWord) => nameWord.startsWith(word)),
      );
      if (!matchesPhrase && !matchesWords) return null;

      const distance = origin
        ? haversineMeters(origin, place.geom)
        : undefined;
      const nameRank = normalizedName === normalizedQuery
        ? 0
        : normalizedName.startsWith(normalizedQuery)
          ? 1
          : matchesPhrase
            ? 2
            : 3;
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
