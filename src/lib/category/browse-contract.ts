import type { PlaceCardData } from "@/lib/loaders/places";
import type { DecisionOriginSource } from "@/lib/scope";

/** First HTML page for a category directory. Large hubs stay bounded. */
export const CATEGORY_INITIAL_PAGE_SIZE = 32;

/** Edge cache for the cacheable category directory and its continuation API. */
export const CATEGORY_CACHE_CONTROL =
  "public, s-maxage=600, stale-while-revalidate=86400";

export type CategoryFacetTag = { slug: string; name: string };

export type CategoryCoffeeModel = {
  best: PlaceCardData[];
  openNow: PlaceCardData[];
  favs: PlaceCardData[];
  nearby: PlaceCardData[];
  county: { municipality: string; places: PlaceCardData[] }[];
  openCount: number;
};

export type CategoryPageModel = {
  slug: string;
  name: string;
  color: string;
  blurb: string;
  rankingMuni: string | null;
  filterMuni: string | null;
  originSource: DecisionOriginSource;
  totalCount: number;
  places: PlaceCardData[];
  topPicks: PlaceCardData[];
  facetTags: CategoryFacetTag[];
  townScopeIsEmpty: boolean;
  scopedTownName: string | null;
  countyFallback: PlaceCardData[];
  subs: { slug: string; name: string; color: string }[];
  coffee: CategoryCoffeeModel | null;
};
