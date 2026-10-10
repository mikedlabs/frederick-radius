import {
  CATEGORIES,
  CATEGORY_BY_SLUG,
  categoryRouteOverride,
  isAmenityCategory,
} from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { humanizeSlug, tagName } from "@/data/tags";
import {
  groupByMunicipality,
  selectCuratedStack,
} from "@/lib/category-ranking";
import { isOpenNow } from "@/lib/hours";
import {
  rankPlaces,
  slimForCategoryList,
  type PlaceCardData,
} from "@/lib/loaders/places";
import { isRecommendable } from "@/lib/relevance";
import {
  resolveServerTownRankingContext,
  type ServerTownRankingContext,
} from "@/lib/scope";
import {
  CATEGORY_INITIAL_PAGE_SIZE,
  type CategoryCoffeeModel,
  type CategoryFacetTag,
  type CategoryPageModel,
} from "./browse-contract";

export {
  CATEGORY_CACHE_CONTROL,
  CATEGORY_INITIAL_PAGE_SIZE,
  type CategoryCoffeeModel,
  type CategoryFacetTag,
  type CategoryPageModel,
} from "./browse-contract";

const FACET_CANDIDATES = [
  "dog-friendly",
  "outdoor",
  "indoor",
  "outdoor-seating",
  "family",
  "kids-6-12",
  "kids-0-5",
  "free",
  "live-music",
  "date-night",
  "year-round",
  "reservations",
  "takeout",
  "delivery",
  "groups",
  "restroom",
] as const;

export function isBrowsableCategorySlug(slug: string): boolean {
  const category = CATEGORY_BY_SLUG[slug];
  return Boolean(
    category && !isAmenityCategory(slug) && !categoryRouteOverride(slug),
  );
}

export function resolveCategoryRankingContext(
  scopeRaw: string | null | undefined,
  homeMuniRaw: string | null | undefined,
): ServerTownRankingContext {
  return resolveServerTownRankingContext(scopeRaw, homeMuniRaw);
}

function facetTagsFor(places: PlaceCardData[]): CategoryFacetTag[] {
  const facetCounts = new Map<string, number>();
  for (const place of places) {
    const tags = new Set(place.tags ?? []);
    for (const slug of FACET_CANDIDATES) {
      if (tags.has(slug)) facetCounts.set(slug, (facetCounts.get(slug) ?? 0) + 1);
    }
  }
  return [...facetCounts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([slug]) => ({ slug, name: tagName(slug) ?? humanizeSlug(slug) }));
}

function topPicksFor(places: PlaceCardData[]): PlaceCardData[] {
  return [...places]
    .filter(isRecommendable)
    .sort((a, b) => {
      const ac = a.open_status.state === "closed" ? 1 : 0;
      const bc = b.open_status.state === "closed" ? 1 : 0;
      return ac - bc;
    })
    .slice(0, 3);
}

export function buildCategoryPageModel(
  slug: string,
  ranking: ServerTownRankingContext,
  options?: { offset?: number; limit?: number; tags?: string[] },
): CategoryPageModel | null {
  const category = CATEGORY_BY_SLUG[slug];
  if (!category || !isBrowsableCategorySlug(slug)) return null;

  const offset = Math.max(0, options?.offset ?? 0);
  const limit = Math.max(1, Math.min(48, options?.limit ?? CATEGORY_INITIAL_PAGE_SIZE));
  const requestedTags = (options?.tags ?? []).filter(Boolean);

  const homeCentroid = ranking.originMunicipality
    ? (MUNICIPALITY_BY_SLUG[ranking.originMunicipality]?.centroid ?? null)
    : null;

  const ranked = rankPlaces({
    category: slug,
    origin: homeCentroid ?? undefined,
    originSource: ranking.source,
    municipality: ranking.filterMunicipality ?? undefined,
    tags: requestedTags.length > 0 ? requestedTags : undefined,
  }).map(slimForCategoryList);

  const scopedTownName = ranking.filterMunicipality
    ? MUNICIPALITY_BY_SLUG[ranking.filterMunicipality]?.name ?? null
    : null;
  const townScopeIsEmpty = ranked.length === 0 && scopedTownName != null;
  const countyFallback =
    townScopeIsEmpty
      ? rankPlaces({
          category: slug,
          origin: homeCentroid ?? undefined,
          originSource: ranking.source,
        })
          .map(slimForCategoryList)
          .filter(isRecommendable)
          .slice(0, 3)
      : [];

  const subs = [
    ...CATEGORIES.filter((item) => item.parent === category.slug),
    ...(category.see_also ?? [])
      .map((seeAlso) => CATEGORIES.find((item) => item.slug === seeAlso))
      .filter((item): item is (typeof CATEGORIES)[number] => Boolean(item)),
  ].map((item) => ({ slug: item.slug, name: item.name, color: item.color }));

  let coffee: CategoryCoffeeModel | null = null;
  if (slug === "coffee") {
    const recommendable = ranked.filter(isRecommendable);
    const ctx = {
      town: ranking.originMunicipality,
      category: slug,
      originSource: ranking.source,
    };
    const curated = selectCuratedStack(recommendable, ctx);
    coffee = {
      best: curated.best,
      openNow: curated.openNow,
      favs: curated.favs,
      nearby: curated.nearby,
      county: groupByMunicipality(recommendable, ctx)
        .filter((group) => !ranking.originMunicipality || group.municipality !== ranking.originMunicipality)
        .slice(0, 8)
        .map((group) => ({
          municipality: group.municipality,
          places: group.places.slice(0, 1).map(slimForCategoryList),
        })),
      openCount: ranked.filter((place) => isOpenNow(place.open_status)).length,
    };
  }

  return {
    slug: category.slug,
    name: category.name,
    color: category.color,
    blurb: category.blurb,
    rankingMuni: ranking.originMunicipality,
    filterMuni: ranking.filterMunicipality,
    originSource: ranking.source,
    totalCount: ranked.length,
    places: ranked.slice(offset, offset + limit),
    topPicks: topPicksFor(ranked),
    facetTags: facetTagsFor(ranked),
    townScopeIsEmpty,
    scopedTownName,
    countyFallback,
    subs,
    coffee,
  };
}
