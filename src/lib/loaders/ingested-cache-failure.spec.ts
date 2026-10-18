import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const previousAsyncLocalStorage = (globalThis as unknown as Record<string, unknown>).AsyncLocalStorage;
  Object.assign(globalThis, { AsyncLocalStorage });
  return { getSql: vi.fn(), previousAsyncLocalStorage };
});
vi.mock("@/lib/db/client", () => ({ getSql: mocks.getSql }));
// Deliberately use the installed next/cache implementation. A pass-through
// mock cannot establish whether a failed read poisons its persisted value.
import { getIngestedSeries } from "./ingested";

type CacheValue = { kind: string; data: { body: string } };
const runtime = globalThis as typeof globalThis & { __incrementalCache?: unknown };
let previousCache: unknown;
const values = new Map<string, CacheValue>();
let stale = false;
const cache = {
  generateSimpleCacheKey: vi.fn(async (key: string) => key),
  get: vi.fn(async (key: string) => values.has(key) ? { value: values.get(key), isStale: stale } : null),
  set: vi.fn(async (key: string, value: CacheValue) => { values.set(key, value); }),
};
afterAll(() => {
  if (mocks.previousAsyncLocalStorage === undefined) {
    delete (globalThis as unknown as Record<string, unknown>).AsyncLocalStorage;
  } else {
    Object.assign(globalThis, { AsyncLocalStorage: mocks.previousAsyncLocalStorage });
  }
});
function row() {
  return { source_uid: "cache-event", source_domain: "fcvfra.com",
    source_url: "https://fcvfra.com/calendar/event", title: "Community celebration",
    description: "A public community celebration.", starts_at_utc: "2026-07-31T22:00:00.000Z",
    ends_at_utc: "2026-08-01T00:00:00.000Z", all_day: false,
    venue_name: "Community Hall", address: "1 Main St, Frederick, MD",
    lat: null, lng: null, municipality: "frederick", category: "community",
    hero_image: null, hero_image_alt: null, updated_at: "2026-07-31T14:00:00.000Z" };
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-07-31T16:00:00Z"));
  vi.stubEnv("RADIUS_DATA_MODE", "runtime");
  previousCache = runtime.__incrementalCache; runtime.__incrementalCache = cache;
  values.clear(); stale = false;
});
afterEach(() => {
  runtime.__incrementalCache = previousCache;
  vi.useRealTimers(); vi.unstubAllEnvs();
});

describe("actual ingested cache failure contract", () => {
  it("does not cache a rejected query and retries before caching the recovered rows", async () => {
    const sql = vi.fn().mockRejectedValueOnce(new Error("database read rejected"))
      .mockImplementation(async () => [row()]);
    mocks.getSql.mockReturnValue(sql);
    await expect(getIngestedSeries()).rejects.toThrow("database read rejected");
    expect(cache.set).not.toHaveBeenCalled(); expect(values.size).toBe(0);
    const recovered = await getIngestedSeries();
    expect(recovered).toHaveLength(1);
    expect(recovered[0].occurrences[0].verifiedAt).toBe("2026-07-31T14:00:00.000Z");
    await expect(getIngestedSeries()).resolves.toEqual(recovered);
    expect(sql).toHaveBeenCalledTimes(2); expect(cache.set).toHaveBeenCalledOnce();
  });
  it("does not cache an empty answer if storage disappears after the outer guard", async () => {
    const sql = vi.fn();
    mocks.getSql.mockReturnValueOnce(sql).mockReturnValue(null);
    await expect(getIngestedSeries()).rejects.toThrow("Ingested event storage unavailable");
    expect(sql).not.toHaveBeenCalled(); expect(cache.set).not.toHaveBeenCalled();
  });
  it("caches an actual successful empty query", async () => {
    const sql = vi.fn().mockResolvedValue([]); mocks.getSql.mockReturnValue(sql);
    await expect(getIngestedSeries()).resolves.toEqual([]);
    await expect(getIngestedSeries()).resolves.toEqual([]);
    expect(sql).toHaveBeenCalledOnce(); expect(cache.set).toHaveBeenCalledOnce();
  });
  it("keeps an existing cached value when foreground revalidation fails", async () => {
    const sql = vi.fn().mockImplementation(async () => [row()]); mocks.getSql.mockReturnValue(sql);
    await getIngestedSeries(); const previous = [...values.values()][0];
    stale = true; sql.mockRejectedValueOnce(new Error("temporary read failure"));
    await expect(getIngestedSeries()).rejects.toThrow("temporary read failure");
    expect([...values.values()][0]).toBe(previous); expect(cache.set).toHaveBeenCalledOnce();
    await expect(getIngestedSeries()).resolves.toHaveLength(1);
    expect(cache.set).toHaveBeenCalledTimes(2);
  });
  it("does not persist optional no-DB data before a later connected read", async () => {
    mocks.getSql.mockReturnValue(null);
    await expect(getIngestedSeries()).resolves.toEqual([]);
    expect(cache.get).not.toHaveBeenCalled(); expect(cache.set).not.toHaveBeenCalled();
    const sql = vi.fn().mockImplementation(async () => [row()]); mocks.getSql.mockReturnValue(sql);
    await expect(getIngestedSeries()).resolves.toHaveLength(1);
    expect(sql).toHaveBeenCalledOnce();
  });
  it("bypasses an already initialized connection and cache during promoted builds", async () => {
    const sql = vi.fn().mockImplementation(async () => [row()]); mocks.getSql.mockReturnValue(sql);
    await getIngestedSeries(); vi.clearAllMocks(); vi.stubEnv("RADIUS_DATA_MODE", "promoted");
    await expect(getIngestedSeries()).resolves.toEqual([]);
    expect(mocks.getSql).not.toHaveBeenCalled(); expect(sql).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled(); expect(cache.set).not.toHaveBeenCalled();
  });
});
