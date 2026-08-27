export type MapboxDailyBudget =
  | "search_box_session"
  | "permanent_geocode"
  | "matrix_element"
  | "directions_request"
  | "isochrone_request"
  | "static_request";

const BUDGETS: Record<
  MapboxDailyBudget,
  { env: string; safeDefault: number; minimum: number; maximum: number }
> = {
  // Search Box is a last-resort fallback after Radius search has no useful
  // answer. The unit is one new suggest/retrieve session, not one result.
  search_box_session: {
    env: "MAPBOX_SEARCH_BOX_DAILY_SESSION_CAP",
    safeDefault: 75,
    minimum: 1,
    maximum: 250,
  },
  // These results may be retained, so every uncached request is explicitly a
  // permanent geocode. Official/local address sources should satisfy most
  // work before this paid fallback is considered.
  permanent_geocode: {
    env: "MAPBOX_PERMANENT_GEOCODING_DAILY_CAP",
    safeDefault: 20,
    minimum: 1,
    maximum: 50,
  },
  // Both matrix callers request one origin by N destinations, so N is the
  // exact element count reserved before an uncached/no-store request.
  matrix_element: {
    env: "MAPBOX_MATRIX_DAILY_ELEMENT_CAP",
    safeDefault: 1_000,
    // Matrix accepts zero as an intentional second kill switch. This lets an
    // operator stop the paid path without rotating a shared token.
    minimum: 0,
    maximum: 3_000,
  },
  // Directions is billed per API request. The route cache collapses repeated
  // origin/destination legs before this allowance is reserved.
  directions_request: {
    env: "MAPBOX_DIRECTIONS_DAILY_REQUEST_CAP",
    safeDefault: 250,
    minimum: 0,
    maximum: 500,
  },
  // Isochrone is billed per API request. Walking/cycling polygons live for a
  // day and traffic-aware driving polygons for five minutes.
  isochrone_request: {
    env: "MAPBOX_ISOCHRONE_DAILY_REQUEST_CAP",
    safeDefault: 100,
    minimum: 0,
    maximum: 250,
  },
  // Static Images is billed per image request. Each allowlisted locator image
  // is buffered into the application cache for 30 days before this unit is
  // reserved again.
  static_request: {
    env: "MAPBOX_STATIC_DAILY_REQUEST_CAP",
    safeDefault: 500,
    minimum: 0,
    maximum: 1_000,
  },
};

export type MapboxRequestFeature = "directions" | "isochrone" | "static";

const REQUEST_FEATURES: Record<
  MapboxRequestFeature,
  { switchEnv: string; budget: MapboxDailyBudget }
> = {
  directions: {
    switchEnv: "MAPBOX_DIRECTIONS_ENABLED",
    budget: "directions_request",
  },
  isochrone: {
    switchEnv: "MAPBOX_ISOCHRONE_ENABLED",
    budget: "isochrone_request",
  },
  static: {
    switchEnv: "MAPBOX_STATIC_MAPS_ENABLED",
    budget: "static_request",
  },
};

/**
 * Resolve a bounded Eastern-day Mapbox allowance in the product's actual
 * billed unit. Invalid configuration returns the conservative default and a
 * configured value can never lift the code-owned maximum.
 */
export function mapboxDailyUsageCap(
  budget: MapboxDailyBudget,
  raw = process.env[BUDGETS[budget].env],
): number {
  const config = BUDGETS[budget];
  const value = raw?.trim();
  if (!value || !/^\d+$/.test(value)) return config.safeDefault;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return config.safeDefault;

  return Math.min(config.maximum, Math.max(config.minimum, parsed));
}

/**
 * One runtime gate shared by every Mapbox Matrix entry point. The feature
 * switch is the primary breaker; a configured zero-element cap is a second,
 * token-preserving way to hold all Matrix work off.
 */
export function mapboxMatrixRuntimeEnabled(
  rawSwitch = process.env.MAPBOX_MATRIX_ENABLED,
  rawCap = process.env.MAPBOX_MATRIX_DAILY_ELEMENT_CAP,
): boolean {
  return (
    rawSwitch?.trim() === "1" &&
    mapboxDailyUsageCap("matrix_element", rawCap) > 0
  );
}

/**
 * Dedicated breaker for a request-priced Mapbox API.
 *
 * Both the explicit switch and a nonzero code-bounded cap are required. A
 * zero cap is an immediate token-preserving kill switch. Callers check this
 * inside their cache-miss function so already-cached responses remain useful
 * without reopening paid provider work.
 */
export function mapboxRequestRuntimeEnabled(
  feature: MapboxRequestFeature,
  rawSwitch = process.env[REQUEST_FEATURES[feature].switchEnv],
  rawCap = process.env[BUDGETS[REQUEST_FEATURES[feature].budget].env],
): boolean {
  return (
    rawSwitch?.trim() === "1" &&
    mapboxDailyUsageCap(REQUEST_FEATURES[feature].budget, rawCap) > 0
  );
}
