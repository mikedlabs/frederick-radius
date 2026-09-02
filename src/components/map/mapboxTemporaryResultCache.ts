/**
 * Retrieved Search Box features are temporary. Keep only a tiny, tab-memory
 * cache so closing and reopening the same result is instant without reusing a
 * closed provider session. Nothing reaches localStorage, the URL, or Radius's
 * database.
 */
export const MAPBOX_TEMPORARY_RESULT_TTL_MS = 5 * 60 * 1_000;
export const MAPBOX_TEMPORARY_RESULT_CACHE_LIMIT = 12;

export type TemporaryMapboxResult = {
  name: string;
  coordinates: { lng: number; lat: number };
  attribution?: string;
};

export type TemporaryMapboxResultCache = Map<
  string,
  { value: TemporaryMapboxResult; expiresAt: number }
>;

export function readTemporaryMapboxResult(
  cache: TemporaryMapboxResultCache,
  mapboxId: string,
  now = Date.now(),
): TemporaryMapboxResult | null {
  const cached = cache.get(mapboxId);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    cache.delete(mapboxId);
    return null;
  }
  // Promote a hit so the bounded map behaves as a small LRU.
  cache.delete(mapboxId);
  cache.set(mapboxId, cached);
  return cached.value;
}

export function writeTemporaryMapboxResult(
  cache: TemporaryMapboxResultCache,
  mapboxId: string,
  value: TemporaryMapboxResult,
  now = Date.now(),
): void {
  for (const [key, cached] of cache) {
    if (cached.expiresAt <= now) cache.delete(key);
  }
  cache.delete(mapboxId);
  cache.set(mapboxId, {
    value,
    expiresAt: now + MAPBOX_TEMPORARY_RESULT_TTL_MS,
  });
  while (cache.size > MAPBOX_TEMPORARY_RESULT_CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}
