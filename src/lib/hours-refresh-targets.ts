/** Pure selection logic for the paid rolling Google hours refresh. Keeping the
 * policy out of the route makes it difficult to silently omit an entire source
 * tier again. */

// Refresh inside the seven-day publication window so one delayed run does not
// immediately turn a whole bucket stale.
export const HOURS_REFRESH_CYCLE_DAYS = 6;
export const HOURS_REFRESH_MIN_SUCCESS_RATIO = 0.9;
export const HOURS_REFRESH_DEFAULT_RUN_CAP = 80;
export const HOURS_REFRESH_MAX_RUN_CAP = 80;
const DAY_MS = 86_400_000;

const TIME_SENSITIVE_FOOD_AND_DRINK_CATEGORIES = new Set([
  "restaurant",
  "restaurants",
  "diner",
  "diners",
  "fast-food",
  "food-court",
  "coffee",
  "coffee-shop",
  "coffee-shops",
  "coffeehouse",
  "coffeehouses",
  "cafe",
  "cafes",
  "bakery",
  "bakeries",
  "bakeshop",
  "bakeshops",
  "patisserie",
  "patisseries",
  "bar",
  "bars",
  "pub",
  "pubs",
  "tavern",
  "taverns",
  "cocktail-bar",
  "cocktail-bars",
  "wine-bar",
  "wine-bars",
  "taproom",
  "taprooms",
  "brewery",
  "breweries",
  "brewpub",
  "brewpubs",
  "beer-garden",
  "beer-gardens",
  "cidery",
  "cideries",
  "meadery",
  "meaderies",
  "winery",
  "wineries",
  "vineyard",
  "vineyards",
  "wine-tasting-room",
  "wine-tasting-rooms",
  "distillery",
  "distilleries",
  "spirits-tasting-room",
  "spirits-tasting-rooms",
  "market",
  "markets",
  "farmers-market",
  "farmers-markets",
  "food-market",
  "food-markets",
  "grocery-market",
  "grocery-markets",
  "supermarket",
  "supermarkets",
  "grocery-store",
  "grocery-stores",
  "pizza",
  "pizzeria",
  "pizzerias",
  "pizza-shop",
  "pizza-shops",
  "ice-cream",
  "ice-cream-shop",
  "ice-cream-shops",
  "icecream",
  "gelato",
  "gelateria",
  "frozen-custard",
  "snowball",
  "snowballs",
]);

function normalizeHoursRefreshCategory(category: string): string {
  return category
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Only businesses whose weekly schedules are central to an immediate
 * eat-or-drink decision belong in the paid six-day rotation. All other
 * categories retain the ordinary freshness guard, so old schedules age out
 * to unknown instead of being presented as current.
 */
export function isHoursRefreshCategory(category: unknown): boolean {
  return (
    typeof category === "string" &&
    TIME_SENSITIVE_FOOD_AND_DRINK_CATEGORIES.has(
      normalizeHoursRefreshCategory(category),
    )
  );
}

/**
 * Operators may lower the daily budget without a deploy, but no environment
 * value can raise the immutable paid-call ceiling above 80. Invalid values
 * retain the safe default rather than disabling the freshness pipeline by
 * accident.
 */
export function resolveHoursRefreshRunCap(
  rawCap = process.env.HOURS_REFRESH_RUN_CAP,
): number {
  if (typeof rawCap !== "string" || !/^\d+$/.test(rawCap.trim())) {
    return HOURS_REFRESH_DEFAULT_RUN_CAP;
  }
  const requested = Number(rawCap.trim());
  if (!Number.isSafeInteger(requested) || requested < 1) {
    return HOURS_REFRESH_DEFAULT_RUN_CAP;
  }
  return Math.min(requested, HOURS_REFRESH_MAX_RUN_CAP);
}

export type HoursRefreshCycleSelection = {
  cycleDay: number;
  mode: "scheduled" | "backfill";
};

/**
 * Resolve the deterministic daily bucket, with an authenticated route-level
 * escape hatch for a missed bucket. The route still enforces the same paid-call
 * cap, provider-identity checks, and cron bearer secret for backfills.
 */
export function resolveHoursRefreshCycleSelection(
  requestUrl: string,
  nowMs = Date.now(),
): HoursRefreshCycleSelection {
  const values = new URL(requestUrl).searchParams.getAll("cycleDay");
  if (values.length === 0) {
    return {
      cycleDay: Math.floor(nowMs / DAY_MS) % HOURS_REFRESH_CYCLE_DAYS,
      mode: "scheduled",
    };
  }
  const requestedDay = values.length === 1 && /^\d+$/.test(values[0])
    ? Number(values[0])
    : Number.NaN;
  if (
    values.length !== 1 ||
    !Number.isInteger(requestedDay) ||
    requestedDay < 0 ||
    requestedDay >= HOURS_REFRESH_CYCLE_DAYS
  ) {
    throw new RangeError(
      `cycleDay must be one integer from 0 to ${HOURS_REFRESH_CYCLE_DAYS - 1}`,
    );
  }
  return {
    cycleDay: requestedDay,
    mode: "backfill",
  };
}

export function hoursRefreshCycleDay(slug: string): number {
  // FNV-1a gives the current food/drink catalog a materially flatter split
  // than the former DJB2 variant (whose largest corrected-category bucket was
  // already 82). The input is only the immutable slug, so assignments remain
  // stable across runs, input ordering, and unrelated catalog additions.
  let h = 2_166_136_261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return (h >>> 0) % HOURS_REFRESH_CYCLE_DAYS;
}

export function selectHoursRefreshTargets<
  T extends {
    slug: string;
    google_place_id?: string | null;
    category: string;
  },
>(places: readonly T[], cycleDay: number, cap: number): T[] {
  if (!Number.isInteger(cycleDay) || cycleDay < 0 || cycleDay >= HOURS_REFRESH_CYCLE_DAYS) {
    throw new RangeError(`cycleDay must be 0-${HOURS_REFRESH_CYCLE_DAYS - 1}`);
  }
  if (!Number.isInteger(cap) || cap < 1) throw new RangeError("cap must be positive");

  // One paid lookup per Google identity. A duplicate is a catalog integrity
  // failure, not an alias-selection problem: choosing one slug would let the
  // resulting hours row silently attach to whichever record sorted first.
  const byGoogleId = new Map<string, T>();
  const bySlug = new Map<string, T>();
  for (const place of [...places].sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (!place.google_place_id) continue;
    const existingSlug = bySlug.get(place.slug);
    if (existingSlug) {
      throw new Error(
        `Duplicate hours-refresh slug ${place.slug} maps to both ${existingSlug.google_place_id} and ${place.google_place_id}.`,
      );
    }
    const existing = byGoogleId.get(place.google_place_id);
    if (existing) {
      throw new Error(
        `Duplicate Google Place ID ${place.google_place_id} belongs to both ${existing.slug} and ${place.slug}.`,
      );
    }
    bySlug.set(place.slug, place);
    byGoogleId.set(place.google_place_id, place);
  }

  return [...byGoogleId.values()]
    .filter((place) => isHoursRefreshCategory(place.category))
    .filter((place) => hoursRefreshCycleDay(place.slug) === cycleDay)
    .slice(0, cap);
}

export type HoursRefreshRunHealth = {
  healthy: boolean;
  status: 200 | 502 | 503;
  error?: string;
};

/**
 * Convert a paid refresh run into an honest HTTP result.
 *
 * Vercel treats any 2xx cron response as a successful run. Returning 200 after
 * every database insert failed made a missing migration indistinguishable from
 * a healthy refresh, while still paying for the Google calls. Keep this pure so
 * the operational boundary remains covered without calling Google or Postgres.
 */
export function assessHoursRefreshRun({
  targeted,
  written,
  withHours,
  deferred,
}: {
  targeted: number;
  written: number;
  withHours: number;
  deferred: number;
}): HoursRefreshRunHealth {
  if (targeted === 0) {
    return {
      healthy: false,
      status: 503,
      error: "No Google-backed places were selected for this cycle day.",
    };
  }
  if (deferred > 0) {
    return {
      healthy: false,
      status: 503,
      error: `${deferred} places exceeded the paid-call cap and would never be reached by this deterministic cycle.`,
    };
  }
  if (written === 0) {
    return {
      healthy: false,
      status: 503,
      error: "No refresh rows were persisted.",
    };
  }
  if (written / targeted < HOURS_REFRESH_MIN_SUCCESS_RATIO) {
    return {
      healthy: false,
      status: 502,
      error: `Only ${written} of ${targeted} targeted places were persisted.`,
    };
  }
  if (withHours === 0) {
    return {
      healthy: false,
      status: 502,
      error: "The run persisted place status but no usable hours schedules.",
    };
  }
  return { healthy: true, status: 200 };
}
