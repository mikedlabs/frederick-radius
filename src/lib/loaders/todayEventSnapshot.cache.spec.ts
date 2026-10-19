import { randomBytes, createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const previous = (globalThis as unknown as Record<string, unknown>).AsyncLocalStorage;
  Object.assign(globalThis, { AsyncLocalStorage });
  return { getSql: vi.fn(), previous };
});
vi.mock("@/lib/db/client", () => ({ getSql: mocks.getSql }));
// Real installed Next cache + App Router work store. A pass-through cache mock
// cannot prove that rejected foreground revalidation retains the prior entry.
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external.js";
import { loadEventArchiveSnapshot, TODAY_EVENT_SNAPSHOT_MAX_AGE_MS } from "./todayEventSnapshot";
import { decodeArchiveEnvelope, encodeArchiveEnvelope,
  EVENT_ARCHIVE_CACHE_DECODED_MAX_BYTES, EVENT_ARCHIVE_CACHE_ENTRY_MAX_BYTES } from "./eventArchiveCacheCodec";

const NOW = new Date("2026-10-18T20:00:00.000Z");
const VERIFIED = "2026-10-18T19:00:00.000Z";
function event() {
  return {
    slug: "archive-community-night-2026-10-19", title: "Community night",
    description: "A declared fictional community event.",
    starts_at: "2026-10-19T22:00:00.000Z", ends_at: "2026-10-20T00:00:00.000Z",
    timezone: "America/New_York", venue_name: "Community Hall",
    address: "1 Main St, Frederick, MD", geom: { lng: -77.41, lat: 39.41 },
    municipality: "frederick", category: "community", audience: [], is_free: true,
    source: "city-frederick", is_verified: true, source_id: "declared-cache-fixture",
    source_url: "https://www.cityoffrederickmd.gov/calendar", license: "test fixture",
    first_seen_at: VERIFIED, last_verified_at: VERIFIED, confidence: "verified",
    geo_confidence: "exact_address", category_name: "Community", municipality_name: "Frederick City",
  };
}
function envelope(candidates: unknown = [{ canonical_slug: event().slug, snapshot: event() }]) {
  return { candidates, archive_status: "ok", archive_finished_at: VERIFIED, archive_records_failed: 0 };
}
type Entry = { kind: string; data: { body: string } };
const entries = new Map<string, Entry>();
let stale = false;
const cache = {
  generateSimpleCacheKey: vi.fn(async (key: string) => createHash("sha256").update(key).digest("hex")),
  get: vi.fn(async (key: string) => entries.has(key) ? { value: entries.get(key), isStale: stale } : null),
  set: vi.fn(async (key: string, value: Entry) => { entries.set(key, value); }),
};
type WorkStore = NonNullable<ReturnType<typeof workAsyncStorage.getStore>>;
async function inApp<T>(run: () => Promise<T>): Promise<T> {
  const store = { incrementalCache: cache, isStaticGeneration: true, pendingRevalidates: {}, route: "/events" } as unknown as WorkStore;
  return workAsyncStorage.run(store, async () => {
    const result = await run();
    await Promise.all(Object.values(store.pendingRevalidates ?? {}));
    return result;
  });
}
const runtime = globalThis as typeof globalThis & { __incrementalCache?: unknown };
let previousCache: unknown;
beforeEach(() => {
  vi.clearAllMocks(); mocks.getSql.mockReset();
  cache.get.mockReset().mockImplementation(async (key: string) => entries.has(key) ? { value: entries.get(key), isStale: stale } : null);
  cache.set.mockReset().mockImplementation(async (key: string, value: Entry) => { entries.set(key, value); });
  vi.stubEnv("RADIUS_DATA_MODE", "runtime");
  vi.spyOn(console, "error").mockImplementation(() => {});
  entries.clear(); stale = false;
  previousCache = runtime.__incrementalCache; runtime.__incrementalCache = cache;
});
afterEach(() => { runtime.__incrementalCache = previousCache; vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(() => {
  if (mocks.previous === undefined) delete (globalThis as unknown as Record<string, unknown>).AsyncLocalStorage;
  else Object.assign(globalThis, { AsyncLocalStorage: mocks.previous });
});

const cached = (now = NOW, options = {}) => inApp(() => loadEventArchiveSnapshot(now, { cache: true, ...options }));

describe("durable archive cache through installed Next App Router revalidation", () => {
  it("shares one raw successful envelope, retaining source dates and hydrating each caller clock", async () => {
    const sql = vi.fn().mockResolvedValue([envelope()]); mocks.getSql.mockReturnValue(sql);
    const first = await cached();
    const later = await cached(new Date(NOW.getTime() + TODAY_EVENT_SNAPSHOT_MAX_AGE_MS + 1));
    expect(sql).toHaveBeenCalledOnce(); expect(cache.set).toHaveBeenCalledOnce();
    expect(first.publicEvents.find(e => e.slug === event().slug)?.last_verified_at).toBe(VERIFIED);
    expect(first.sourceHealth.degraded).toBe(false);
    expect(later.publicEvents.find(e => e.slug === event().slug)?.last_verified_at).toBe(VERIFIED);
    expect(later.sourceHealth.issues).toContainEqual(expect.objectContaining({ code: "event_archive_stale" }));
    const encoded = JSON.parse([...entries.values()][0].data.body);
    expect(await decodeArchiveEnvelope(encoded)).toEqual(envelope());
  });
  it("retains prior actual rows when stale foreground revalidation rejects, then replaces them on recovery", async () => {
    const sql = vi.fn().mockResolvedValue([envelope()]); mocks.getSql.mockReturnValue(sql);
    await cached(); const previous = [...entries.values()][0]; stale = true;
    sql.mockRejectedValueOnce(new Error("temporary database failure"));
    const retained = await cached();
    expect(retained.publicEvents.some(e => e.slug === event().slug)).toBe(true);
    expect([...entries.values()][0]).toBe(previous); expect(cache.set).toHaveBeenCalledOnce();
    sql.mockResolvedValueOnce([envelope([])]);
    await cached(); expect(cache.set).toHaveBeenCalledTimes(2);
    expect(await decodeArchiveEnvelope(JSON.parse([...entries.values()][0].data.body))).toEqual(envelope([]));
  });
  it("cancels a timed-out stale refresh without replacing the persisted value", async () => {
    const cancel = vi.fn(); const sql = vi.fn().mockResolvedValue([envelope()]); mocks.getSql.mockReturnValue(sql);
    await cached(NOW, { timeoutMs: 100 }); stale = true;
    sql.mockReturnValueOnce(Object.assign(new Promise(() => {}), { cancel }));
    const retained = await cached(NOW, { timeoutMs: 100 });
    expect(cancel).toHaveBeenCalledOnce(); expect(cache.set).toHaveBeenCalledOnce();
    expect(retained.publicEvents.some(e => e.slug === event().slug)).toBe(true);
  });
  it("bounds a never-settling cache lookup without starting SQL", async () => {
    const sql = vi.fn(); mocks.getSql.mockReturnValue(sql);
    cache.get.mockImplementationOnce(() => new Promise(() => {}));
    const result = await cached(NOW, { timeoutMs: 100 });
    expect(result.sourceHealth.issues[0].code).toBe("event_archive_timeout");
    expect(sql).not.toHaveBeenCalled(); expect(cache.set).not.toHaveBeenCalled();
  }, 2_000);
  it("cannot start SQL when a cache miss resolves after the caller's deadline", async () => {
    const sql = vi.fn(); mocks.getSql.mockReturnValue(sql);
    let resolveLookup!: (value: null) => void;
    cache.get.mockImplementationOnce(() => new Promise(resolve => { resolveLookup = resolve; }));
    expect((await cached(NOW, { timeoutMs: 100 })).sourceHealth.issues[0].code).toBe("event_archive_timeout");
    resolveLookup(null);
    await new Promise(resolve => setImmediate(resolve));
    expect(sql).not.toHaveBeenCalled(); expect(cache.set).not.toHaveBeenCalled();
  }, 2_000);
  it("cancels running SQL within the same overall budget after a delayed cache lookup", async () => {
    const cancel = vi.fn(); const sql = vi.fn(() => Object.assign(new Promise(() => {}), { cancel }));
    mocks.getSql.mockReturnValue(sql);
    cache.get.mockImplementationOnce(async () => { await new Promise(resolve => setTimeout(resolve, 40)); return null; });
    const result = await cached(NOW, { timeoutMs: 100 });
    expect(result.sourceHealth.issues[0].code).toBe("event_archive_timeout");
    expect(sql).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalledOnce();
    expect(cache.set).not.toHaveBeenCalled();
  }, 2_000);
  it("does not cache a first-read failure and later caches its recovery", async () => {
    const sql = vi.fn().mockRejectedValueOnce(new Error("first read failed")).mockResolvedValue([envelope()]);
    mocks.getSql.mockReturnValue(sql);
    expect((await cached()).sourceHealth.issues[0].code).toBe("event_archive_unavailable");
    expect(cache.set).not.toHaveBeenCalled();
    expect((await cached()).publicEvents.some(e => e.slug === event().slug)).toBe(true);
    expect(sql).toHaveBeenCalledTimes(2); expect(cache.set).toHaveBeenCalledOnce();
  });
  it("caches a genuinely successful empty archive without treating it as a read failure", async () => {
    const sql = vi.fn().mockResolvedValue([envelope([])]); mocks.getSql.mockReturnValue(sql);
    expect((await cached()).sourceHealth.degraded).toBe(false); await cached();
    expect(sql).toHaveBeenCalledOnce(); expect(cache.set).toHaveBeenCalledOnce();
    expect(await decodeArchiveEnvelope(JSON.parse([...entries.values()][0].data.body))).toEqual(envelope([]));
  });
  it.each([
    { label: "missing anchored row", rows: [] },
    { label: "non-array candidates", rows: [{ ...envelope(), candidates: null }] },
    { label: "malformed candidate row", rows: [{ ...envelope(), candidates: [{}] }] },
  ])("never caches missing anchored rows or malformed candidate arrays: $label", async ({ rows }) => {
    const sql = vi.fn().mockResolvedValue(rows); mocks.getSql.mockReturnValue(sql);
    expect((await cached()).sourceHealth.issues[0].code).toBe("event_archive_unavailable");
    expect(sql).toHaveBeenCalledOnce(); expect(cache.set).not.toHaveBeenCalled();
  });
  it("keys explicit Eastern windows, limits and normalized timeouts without a release SHA", async () => {
    const sql = vi.fn().mockResolvedValue([envelope()]); mocks.getSql.mockReturnValue(sql);
    await cached(NOW, { limit: 6, timeoutMs: 2_500.9 });
    await cached(new Date(NOW.getTime() + 1_000), { limit: 6, timeoutMs: 2_500.1 });
    expect(sql).toHaveBeenCalledOnce();
    await cached(NOW, { limit: 7 }); await cached(new Date("2026-10-19T04:00:00.000Z"), { limit: 6 });
    await cached(NOW, { limit: 6, horizonDays: 9 }); await cached(NOW, { limit: 6, timeoutMs: 100 });
    expect(sql).toHaveBeenCalledTimes(5);
    const keys = cache.generateSimpleCacheKey.mock.calls.map(([key]) => key);
    expect(keys[0]).toContain("durable-event-archive-envelope-gzip-v1,2026-10-18T04:00:00.000Z");
    expect(keys[0]).toContain(",6,2500-");
    expect(keys.some(key => key.includes("2026-10-19T04:00:00.000Z"))).toBe(true);
  });
  it("bypasses cache for promoted/no-DB callers even when an entry already exists", async () => {
    const sql = vi.fn().mockResolvedValue([envelope()]); mocks.getSql.mockReturnValue(sql); await cached();
    vi.clearAllMocks(); vi.stubEnv("RADIUS_DATA_MODE", "promoted"); await cached();
    expect(mocks.getSql).not.toHaveBeenCalled(); expect(cache.get).not.toHaveBeenCalled();
    vi.stubEnv("RADIUS_DATA_MODE", "runtime"); mocks.getSql.mockReturnValue(null); await cached();
    expect(cache.get).not.toHaveBeenCalled(); expect(cache.set).not.toHaveBeenCalled();
  });
  it("does not cache if storage disappears between the outer guard and cache callback", async () => {
    const sql = vi.fn(); mocks.getSql.mockReturnValueOnce(sql).mockReturnValue(null);
    const result = await cached(); expect(result.sourceHealth.degraded).toBe(true);
    expect(sql).not.toHaveBeenCalled(); expect(cache.set).not.toHaveBeenCalled();
  });
  it("checks promoted mode again inside a cache miss", async () => {
    const sql = vi.fn(); mocks.getSql.mockReturnValue(sql);
    cache.get.mockImplementationOnce(async () => { vi.stubEnv("RADIUS_DATA_MODE", "promoted"); return null; });
    expect((await cached()).sourceHealth.degraded).toBe(true);
    expect(sql).not.toHaveBeenCalled(); expect(cache.set).not.toHaveBeenCalled();
  });
  it("returns an over-budget fresh successful envelope without persisting/truncating it", async () => {
    const largeEvent = { ...event(), description: randomBytes(1_600_000).toString("base64") };
    const raw = envelope([{ canonical_slug: largeEvent.slug, snapshot: largeEvent }]);
    const sql = vi.fn().mockResolvedValue([raw]); mocks.getSql.mockReturnValue(sql);
    const result = await cached();
    expect(result.sourceHealth.degraded).toBe(false);
    expect(result.publicEvents.find(e => e.slug === event().slug)?.description).toBe(largeEvent.description);
    expect(cache.set).not.toHaveBeenCalled();
    await expect(encodeArchiveEnvelope(raw)).rejects.toThrow("encoded cache budget");
  });
  it("rejects invalid cached codec shapes without treating them as a healthy empty archive", async () => {
    const sql = vi.fn().mockResolvedValue([envelope()]); mocks.getSql.mockReturnValue(sql); await cached();
    const [key, entry] = [...entries.entries()][0]; entries.set(key, { ...entry, data: { body: JSON.stringify({ version: 99 }) } });
    expect((await cached()).sourceHealth.degraded).toBe(true);
    expect(sql).toHaveBeenCalledOnce(); expect(cache.set).toHaveBeenCalledOnce();
    expect((await inApp(() => loadEventArchiveSnapshot(NOW, { cache: false }))).sourceHealth.degraded).toBe(false);
    expect(sql).toHaveBeenCalledTimes(2);
  });
  it("leaves the default and explicit cache:false paths on direct bounded SQL reads", async () => {
    const sql = vi.fn().mockResolvedValue([envelope()]); mocks.getSql.mockReturnValue(sql);
    await inApp(() => loadEventArchiveSnapshot(NOW));
    await inApp(() => loadEventArchiveSnapshot(NOW, { cache: false }));
    expect(sql).toHaveBeenCalledTimes(2); expect(cache.get).not.toHaveBeenCalled(); expect(cache.set).not.toHaveBeenCalled();
  });
});

describe("bounded lossless archive cache codec", () => {
  it("round-trips Unicode, quotes, nulls and source dates without JSON escaping expansion", async () => {
    const raw = { ...envelope(), example: 'Café "Fred" \n \u2028 🎺', nullable: null };
    const encoded = await encodeArchiveEnvelope(raw);
    expect(await decodeArchiveEnvelope(encoded)).toEqual(raw);
    expect(Buffer.byteLength(JSON.stringify(encoded))).toBeLessThan(EVENT_ARCHIVE_CACHE_ENTRY_MAX_BYTES);
  });
  it("rejects oversized decode declarations and compressed expansion before accepting JSON", async () => {
    const encoded = await encodeArchiveEnvelope(envelope());
    await expect(decodeArchiveEnvelope({ ...encoded, decodedBytes: EVENT_ARCHIVE_CACHE_DECODED_MAX_BYTES + 1 })).rejects.toThrow();
    await expect(decodeArchiveEnvelope({ ...encoded, decodedBytes: encoded.decodedBytes + 1 })).rejects.toThrow("byte count");
    const bomb = gzipSync("x".repeat(EVENT_ARCHIVE_CACHE_DECODED_MAX_BYTES + 1));
    await expect(decodeArchiveEnvelope({ version: 1, encoding: "gzip-base64", decodedBytes: 10, data: bomb.toString("base64") })).rejects.toThrow();
  });
  it.each([
    { label: "null", value: null },
    { label: "array", value: [] },
    { label: "invalid base64", value: { version: 1, encoding: "gzip-base64", decodedBytes: 4, data: "!!!!" } },
    { label: "invalid gzip", value: { version: 1, encoding: "gzip-base64", decodedBytes: 4, data: "eA==" } },
  ])("rejects malformed cache transport $label", async ({ value }) => {
    await expect(decodeArchiveEnvelope(value)).rejects.toThrow();
  });
});
