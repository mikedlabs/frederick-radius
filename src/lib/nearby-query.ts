import { CRAVING_BY_KEY } from "@/data/cravings";
import { CUISINES } from "@/lib/cuisine";
import { isMealKey } from "@/lib/meal";
import { parseScope, scopeToParam, type Scope } from "@/lib/scope";
import type { RightNowSort } from "@/lib/right-now-ranking";

export type NearbyQueryValues = Record<string, string | string[] | undefined>;
type QueryReader = Pick<URLSearchParams, "get">;

export type NearbyQueryState = {
  cravingKey: string | null;
  facetKey: string | null;
  openOnly: boolean;
  closingSoonOnly: boolean;
  sort: RightNowSort;
  scope: Scope | null;
};

// These cuisines have their own cravings rather than Food facet chips.
export const NEARBY_FOOD_FACET_EXCLUDE = new Set(["coffee", "bar", "brewery", "dessert"]);
const QUERY_KEYS = ["c", "facet", "open", "closing", "sort", "in", "town"];

export const NEARBY_CATEGORY_HISTORY_KEY = "__frederickRadiusNearbyCategory";

/** A category picked inside Nearby has a real prior picker entry, even when
 * the browser originally arrived directly or from an external website. */
export function hasNearbyCategoryBackStep(raw: unknown): boolean {
  return Boolean(raw && typeof raw === "object" &&
    (raw as Record<string, unknown>)[NEARBY_CATEGORY_HISTORY_KEY] === true);
}

/** Whether a newly chosen intent can use general-hours refinements. Old
 * explicit URL flags remain readable below so the UI can explain/clear them. */
export function nearbySupportsHours(cravingKey: string | null): boolean {
  if (!cravingKey) return false;
  if (isMealKey(cravingKey)) return true;
  if (!Object.hasOwn(CRAVING_BY_KEY, cravingKey)) return false;
  const craving = CRAVING_BY_KEY[cravingKey];
  return !craving.alwaysOpen && craving.availability !== "not-applicable";
}

/** Preferences only: no device coordinates, computed hours, or live counts. */
export function readNearbyQuery(
  input: QueryReader | NearbyQueryValues,
  fallbackScope: Scope | null = null,
): NearbyQueryState {
  const get = (key: string): string | null => {
    if (typeof input.get === "function") return input.get(key);
    const raw = Object.hasOwn(input, key) ? (input as NearbyQueryValues)[key] : undefined;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] ?? null : null;
  };
  const rawCraving = get("c");
  const cravingKey = rawCraving && (Object.hasOwn(CRAVING_BY_KEY, rawCraving) || isMealKey(rawCraving))
    ? rawCraving
    : null;
  const craving = cravingKey && Object.hasOwn(CRAVING_BY_KEY, cravingKey)
    ? CRAVING_BY_KEY[cravingKey]
    : null;
  const rawFacet = get("facet");
  const facetKey = rawFacet && craving && (
    craving.cuisineFacets
      ? !NEARBY_FOOD_FACET_EXCLUDE.has(rawFacet) && CUISINES.some((item) => item.slug === rawFacet)
      : craving.facets?.some((item) => item.key === rawFacet)
  ) ? rawFacet : null;
  const rawScope = get("in") ?? get("town");
  // An explicit but invalid scope must not silently revive a saved town.
  const scope = rawScope === null ? fallbackScope : parseScope(rawScope) ?? "county";
  const rawSort = get("sort");
  return {
    cravingKey,
    facetKey,
    openOnly: Boolean(cravingKey && !craving?.alwaysOpen && get("open") === "1"),
    closingSoonOnly: Boolean(cravingKey && !craving?.alwaysOpen && get("closing") === "1"),
    sort: cravingKey && (rawSort === "nearest" || rawSort === "rated") ? rawSort : "smart",
    scope,
  };
}

function queryValues(state: NearbyQueryState): NearbyQueryValues {
  return {
    c: state.cravingKey ?? undefined,
    facet: state.facetKey ?? undefined,
    open: state.openOnly ? "1" : undefined,
    closing: state.closingSoonOnly ? "1" : undefined,
    sort: state.sort === "smart" ? undefined : state.sort,
    in: state.scope ? scopeToParam(state.scope) : undefined,
  };
}

/** Match the existing category-pick contract: reset facet/urgency, keep sort,
 * Open now, and geography when those preferences apply to the new category. */
export function changeNearbyQuery(
  previous: NearbyQueryState,
  patch: Partial<NearbyQueryState>,
): NearbyQueryState {
  const categoryChanged = patch.cravingKey !== undefined && patch.cravingKey !== previous.cravingKey;
  const next = {
    ...previous,
    ...(categoryChanged ? { facetKey: null, closingSoonOnly: false } : {}),
    // An explicit new Parks/lodging choice must not inherit Food's urgency.
    // Merely opening an old Parks URL does not run this category transition.
    ...(categoryChanged && !nearbySupportsHours(patch.cravingKey ?? null) ? { openOnly: false } : {}),
    ...patch,
  };
  return readNearbyQuery(queryValues(next));
}

/** Canonicalize owned keys while preserving other journey parameters/hash. */
export function nearbyQueryHref(currentHref: string, state: NearbyQueryState): string | null {
  const url = new URL(currentHref, "https://frederick-radius.invalid");
  if (url.pathname !== "/nearby") return null;
  const normalized = queryValues(readNearbyQuery(queryValues(state)));
  for (const key of QUERY_KEYS) url.searchParams.delete(key);
  for (const [key, value] of Object.entries(normalized)) {
    if (typeof value === "string") url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Preserve app history metadata while letting Next synchronize the new URL.
 * Next's native adapter copies its current internal fields back in; passing
 * its __NA/_N guards ourselves would bypass that adapter's URL notification.
 */
export function nearbyHistoryState(raw: unknown): Record<string, unknown> {
  const state = raw && typeof raw === "object" ? { ...raw } as Record<string, unknown> : {};
  delete state.__NA;
  delete state._N;
  return state;
}
