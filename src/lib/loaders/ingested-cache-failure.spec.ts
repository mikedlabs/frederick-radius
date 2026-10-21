import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

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
type TestSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
function transactionalSql(query: Mock<TestSql>, configure = vi.fn<TestSql>().mockResolvedValue([])) {
  const transaction = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    if (strings.join(" ").includes("set_config('statement_timeout'")) return configure(strings, ...values);
    return query(strings, ...values);
  });
  const begin = vi.fn(async (run: (sql: TestSql) => Promise<unknown>) => run(transaction));
  return Object.assign(query, { begin, transaction, configure });
}

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
  it("sets a transaction-local five-second deadline before the unchanged parameterized SELECT", async () => {
    const sql = transactionalSql(vi.fn<TestSql>().mockResolvedValue([row()]));
    mocks.getSql.mockReturnValue(sql);
    await expect(getIngestedSeries(37)).resolves.toHaveLength(1);
    expect(sql.begin).toHaveBeenCalledOnce();
    expect(sql.transaction).toHaveBeenCalledTimes(2);
    const [setting] = sql.transaction.mock.calls[0];
    expect(setting.join(" ")).toBe("select set_config('statement_timeout', '5000ms', true)");
    const [select, ...parameters] = sql.transaction.mock.calls[1];
    expect(select.join(" ")).toContain("from ingested_events e");
    expect(select.join(" ")).toMatch(/where starts_at_utc >=\s+or ends_at_utc >=/);
    expect(select.join(" ")).toContain("order by starts_at_utc asc");
    expect(parameters).toEqual(["frederick.librarycalendar.com", "2026-07-31T10:00:00.000Z", "2026-07-31T10:00:00.000Z", 37]);
    expect(sql.configure.mock.invocationCallOrder[0]).toBeLessThan(sql.mock.invocationCallOrder[0]);
  });
  it("does not cache a server statement-timeout rejection and can read again on the next attempt", async () => {
    const timeout = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
    const sql = transactionalSql(vi.fn<TestSql>().mockRejectedValueOnce(timeout).mockResolvedValue([row()]));
    mocks.getSql.mockReturnValue(sql);
    await expect(getIngestedSeries()).rejects.toBe(timeout);
    expect(cache.set).not.toHaveBeenCalled(); expect(values.size).toBe(0);
    const recovered = await getIngestedSeries();
    expect(recovered).toHaveLength(1);
    expect(recovered[0].occurrences[0].verifiedAt).toBe("2026-07-31T14:00:00.000Z");
    expect(sql.begin).toHaveBeenCalledTimes(2); expect(cache.set).toHaveBeenCalledOnce();
  });
  it("does not run or cache the SELECT when setting its local deadline fails", async () => {
    const settingError = new Error("statement timeout setup rejected");
    const configure = vi.fn<TestSql>().mockRejectedValueOnce(settingError).mockResolvedValue([]);
    const sql = transactionalSql(vi.fn<TestSql>().mockResolvedValue([row()]), configure);
    mocks.getSql.mockReturnValue(sql);
    await expect(getIngestedSeries()).rejects.toBe(settingError);
    expect(sql).not.toHaveBeenCalled(); expect(cache.set).not.toHaveBeenCalled();
    await expect(getIngestedSeries()).resolves.toHaveLength(1);
    expect(sql).toHaveBeenCalledOnce(); expect(cache.set).toHaveBeenCalledOnce();
  });
  it("does not cache rows if completing their transaction rejects", async () => {
    const completionError = new Error("transaction completion rejected");
    const sql = transactionalSql(vi.fn<TestSql>().mockResolvedValue([row()]));
    sql.begin.mockImplementationOnce(async run => { await run(sql.transaction); throw completionError; });
    mocks.getSql.mockReturnValue(sql);
    await expect(getIngestedSeries()).rejects.toBe(completionError);
    expect(sql).toHaveBeenCalledOnce(); expect(cache.set).not.toHaveBeenCalled();
    await expect(getIngestedSeries()).resolves.toHaveLength(1);
    expect(sql).toHaveBeenCalledTimes(2); expect(cache.set).toHaveBeenCalledOnce();
  });
  it("does not cache a rejected query and retries before caching the recovered rows", async () => {
    const sql = vi.fn<TestSql>().mockRejectedValueOnce(new Error("database read rejected"))
      .mockImplementation(async () => [row()]);
    mocks.getSql.mockReturnValue(transactionalSql(sql));
    await expect(getIngestedSeries()).rejects.toThrow("database read rejected");
    expect(cache.set).not.toHaveBeenCalled(); expect(values.size).toBe(0);
    const recovered = await getIngestedSeries();
    expect(recovered).toHaveLength(1);
    expect(recovered[0].occurrences[0].verifiedAt).toBe("2026-07-31T14:00:00.000Z");
    await expect(getIngestedSeries()).resolves.toEqual(recovered);
    expect(sql).toHaveBeenCalledTimes(2); expect(cache.set).toHaveBeenCalledOnce();
  });
  it("does not cache an empty answer if storage disappears after the outer guard", async () => {
    const sql = vi.fn<TestSql>();
    mocks.getSql.mockReturnValueOnce(transactionalSql(sql)).mockReturnValue(null);
    await expect(getIngestedSeries()).rejects.toThrow("Ingested event storage unavailable");
    expect(sql).not.toHaveBeenCalled(); expect(cache.set).not.toHaveBeenCalled();
  });
  it("caches an actual successful empty query", async () => {
    const sql = vi.fn<TestSql>().mockResolvedValue([]); mocks.getSql.mockReturnValue(transactionalSql(sql));
    await expect(getIngestedSeries()).resolves.toEqual([]);
    await expect(getIngestedSeries()).resolves.toEqual([]);
    expect(sql).toHaveBeenCalledOnce(); expect(cache.set).toHaveBeenCalledOnce();
  });
  it("keeps an existing cached value when foreground revalidation fails", async () => {
    const sql = vi.fn<TestSql>().mockImplementation(async () => [row()]); mocks.getSql.mockReturnValue(transactionalSql(sql));
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
    const sql = vi.fn<TestSql>().mockImplementation(async () => [row()]); mocks.getSql.mockReturnValue(transactionalSql(sql));
    await expect(getIngestedSeries()).resolves.toHaveLength(1);
    expect(sql).toHaveBeenCalledOnce();
  });
  it("bypasses an already initialized connection and cache during promoted builds", async () => {
    const sql = vi.fn<TestSql>().mockImplementation(async () => [row()]); mocks.getSql.mockReturnValue(transactionalSql(sql));
    await getIngestedSeries(); vi.clearAllMocks(); vi.stubEnv("RADIUS_DATA_MODE", "promoted");
    await expect(getIngestedSeries()).resolves.toEqual([]);
    expect(mocks.getSql).not.toHaveBeenCalled(); expect(sql).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled(); expect(cache.set).not.toHaveBeenCalled();
  });
});
