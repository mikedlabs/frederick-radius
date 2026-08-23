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
const LISTENERS = new Map<
  string,
  Set<(value: LivePlaceHoursData) => void>
>();
const CLIENT_CACHE_MS = 5 * 60_000;

function usableLiveHours(value: LivePlaceHoursData): boolean {
  return Boolean(
    value.structured_hours &&
    value.open_status &&
    value.hours_checked_at &&
    value.hours?.length,
  );
}

function publishLivePlaceHours(
  slug: string,
  value: LivePlaceHoursData,
): void {
  for (const listener of LISTENERS.get(slug) ?? []) listener(value);
}

/**
 * Keep the hero status and schedule disclosure in sync after a deliberate
 * current-hours request. Subscribing is local and free; it never starts a
 * network request by itself.
 */
export function subscribeLivePlaceHours(
  slug: string,
  listener: (value: LivePlaceHoursData) => void,
): () => void {
  const listeners = LISTENERS.get(slug) ?? new Set();
  listeners.add(listener);
  LISTENERS.set(slug, listeners);
  const cached = CACHE.get(slug);
  if (cached?.value && cached.expiresAt > Date.now()) {
    listener(cached.value);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) LISTENERS.delete(slug);
  };
}
/**
 * Coalesce deliberate current-hours checks across place surfaces. The
 * short-lived cache is memory-only, scoped to the current browser session,
 * and never written to Next's data cache or storage.
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
        rememberLivePlaceHours(slug, value);
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
  publishLivePlaceHours(slug, value);
}
