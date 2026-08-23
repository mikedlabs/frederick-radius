import type { Hours } from "@/data/places";
import type { OpenStatus } from "@/lib/hours";

export type LivePlaceHoursData = {
  hours?: string[];
  structured_hours?: Hours;
  open_status?: OpenStatus;
  hours_checked_at?: string;
};

type CachedLiveHours = {
  expiresAt: number;
  value?: LivePlaceHoursData;
  pending?: Promise<LivePlaceHoursData>;
};

const CACHE = new Map<string, CachedLiveHours>();
const CLIENT_CACHE_MS = 5 * 60_000;

function usableLiveHours(value: LivePlaceHoursData): boolean {
  return Boolean(
    value.structured_hours &&
    value.open_status &&
    value.hours_checked_at &&
    value.hours?.length,
  );
}
/**
 * Coalesce the two consumers on a full place page (the hero status and the
 * schedule disclosure). The short-lived cache is memory-only, scoped to the
 * current browser session, and never written to Next's data cache or storage.
 */
export function loadLivePlaceHours(slug: string): Promise<LivePlaceHoursData> {
  const now = Date.now();
  const existing = CACHE.get(slug);
  if (existing?.pending) return existing.pending;
  if (existing?.value && existing.expiresAt > now) {
    return Promise.resolve(existing.value);
  }

  const pending = fetch(
    `/api/place/${encodeURIComponent(slug)}/enrich?mode=hours`,
    { cache: "no-store" },
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Current hours request failed: ${response.status}`);
      }
      const value = await response.json() as LivePlaceHoursData;
      if (usableLiveHours(value)) {
        CACHE.set(slug, { value, expiresAt: Date.now() + CLIENT_CACHE_MS });
      } else {
        CACHE.delete(slug);
      }
      return value;
    })
    .catch((error) => {
      CACHE.delete(slug);
      throw error;
    });

  CACHE.set(slug, { pending, expiresAt: now + CLIENT_CACHE_MS });
  return pending;
}

/** Let the explicit richer-details request satisfy current-hours consumers
 * when it happens first, rather than spending on a second Google call. */
export function rememberLivePlaceHours(
  slug: string,
  value: LivePlaceHoursData,
): void {
  if (!usableLiveHours(value)) return;
  CACHE.set(slug, {
    value,
    expiresAt: Date.now() + CLIENT_CACHE_MS,
  });
}
