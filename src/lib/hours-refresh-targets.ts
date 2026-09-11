/** Pure selection logic for the paid rolling Google hours refresh. Keeping the
 * policy out of the route makes it difficult to silently omit an entire source
 * tier again. */

// Refresh inside the seven-day publication window so one delayed run does not
// immediately turn a whole bucket stale.
export const HOURS_REFRESH_CYCLE_DAYS = 6;
export const HOURS_REFRESH_MIN_SUCCESS_RATIO = 0.9;
const DAY_MS = 86_400_000;

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
  let h = 5381;
  for (let i = 0; i < slug.length; i++) {
    h = ((h * 33) ^ slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % HOURS_REFRESH_CYCLE_DAYS;
}

export function selectHoursRefreshTargets<
  T extends { slug: string; google_place_id?: string | null },
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
