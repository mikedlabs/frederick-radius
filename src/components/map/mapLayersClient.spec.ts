import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadMapLayers,
  resetMapLayersRequest,
} from "./mapLayersClient";

afterEach(() => {
  resetMapLayersRequest();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("mapLayersClient", () => {
  it("deduplicates optional context requests in one map session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          amenities: [
            {
              id: "water-1",
              kind: "water",
              name: "Drinking fountain",
              lng: -77.41,
              lat: 39.41,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      loadMapLayers(),
      loadMapLayers(),
    ]);

    expect(first.amenities).toHaveLength(1);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/map/layers?groups=context",
      expect.any(Object),
    );
  });

  it("exposes a failed request and keeps the group retryable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sourceHealth: {
              context: { status: "current", unavailable: [] },
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadMapLayers()).resolves.toMatchObject({
      amenities: [],
      sourceHealth: {
        context: {
          status: "unavailable",
          unavailable: ["Map data service"],
        },
      },
    });
    await expect(loadMapLayers()).resolves.toMatchObject({
      amenities: [],
      sourceHealth: {
        context: { status: "current", unavailable: [] },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/map/layers?groups=context",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("does not request a specialist group until it is explicitly named", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await loadMapLayers(["context"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await loadMapLayers(["outdoors"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/map/layers?groups=outdoors",
      expect.any(Object),
    );
  });

  it("keeps a partial group retryable without discarding useful data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            trailLines: { type: "FeatureCollection", features: [] },
            cemeteries: [{ id: "one", name: "One", approximate: false, lng: -77.4, lat: 39.4 }],
            sourceHealth: {
              outdoors: {
                status: "partial",
                unavailable: ["County trails"],
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            trailLines: { type: "FeatureCollection", features: [] },
            cemeteries: [],
            sourceHealth: {
              outdoors: { status: "current", unavailable: [] },
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const partial = await loadMapLayers(["outdoors"]);
    expect(partial.cemeteries).toHaveLength(1);
    expect(partial.sourceHealth.outdoors?.status).toBe("partial");

    const recovered = await loadMapLayers(["outdoors"]);
    expect(recovered.cemeteries).toEqual([]);
    expect(recovered.sourceHealth.outdoors?.status).toBe("current");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/map/layers?groups=outdoors",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("keeps stale-good group data when a degraded retry becomes unavailable", async () => {
    const cemetery = {
      id: "historic-one",
      name: "Historic cemetery",
      approximate: false,
      lng: -77.4,
      lat: 39.4,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            cemeteries: [cemetery],
            sourceHealth: {
              outdoors: {
                status: "partial",
                unavailable: ["County trails"],
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sourceHealth: {
              outdoors: {
                status: "unavailable",
                unavailable: ["County trails", "Historic cemeteries"],
              },
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const partial = await loadMapLayers(["outdoors"]);
    expect(partial.cemeteries).toEqual([cemetery]);

    const unavailable = await loadMapLayers(["outdoors"]);
    expect(unavailable.cemeteries).toEqual([cemetery]);
    expect(unavailable.sourceHealth.outdoors).toMatchObject({
      status: "unavailable",
      unavailable: ["County trails", "Historic cemeteries"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});


describe("live map snapshot expiry and transport ownership", () => {
  const NOW = new Date("2026-10-06T20:00:00Z");
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  function signals(count: number, asOf = new Date().toISOString(), headers?: HeadersInit) {
    return new Response(JSON.stringify({
      smartSignals: { conditionsStatus: "current", activeWeatherAlert: false, marketsOpenTodayCount: count, roadsTrendingLongerCount: 0 },
      sourceHealth: { signals: { status: "current", unavailable: [], asOf } },
    }), { headers });
  }

  it("deduplicates fresh data, then replaces a successful operational snapshot after its interval", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(signals(fetchMock.mock.calls.length)));
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([loadMapLayers(["signals"]), loadMapLayers(["signals"])]);
    vi.setSystemTime(new Date(NOW.getTime() + 59_999));
    await loadMapLayers(["signals"], { onlyExpired: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    const refreshed = await loadMapLayers(["signals"], { onlyExpired: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/map/layers?groups=signals", expect.objectContaining({ cache: "no-store" }));
    expect(refreshed.smartSignals?.marketsOpenTodayCount).toBe(2);
  });

  it("expires newly current weather after two partial successes even when retained group health is already stale", async () => {
    const partial = (count: number) => new Response(JSON.stringify({
      smartSignals: { conditionsStatus: "current", activeWeatherAlert: false, marketsOpenTodayCount: count, roadsTrendingLongerCount: 0 },
      sourceHealth: { signals: { status: "partial", unavailable: ["Road context"], asOf: new Date().toISOString() } },
    }));
    const fetchMock = vi.fn().mockImplementationOnce(() => Promise.resolve(partial(1)))
      .mockImplementationOnce(() => Promise.resolve(partial(2))).mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await loadMapLayers(["signals"]);
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    const recent = await loadMapLayers(["signals"], { onlyExpired: true });
    expect(recent.sourceHealth.signals?.stale).toBe(true);
    expect(recent.smartSignals?.conditionsStatus).toBe("current");
    vi.setSystemTime(new Date(NOW.getTime() + 120_000));
    const failed = await loadMapLayers(["signals"], { onlyExpired: true });
    expect(failed.smartSignals?.marketsOpenTodayCount).toBe(2);
    expect(failed.sourceHealth.signals).toMatchObject({ status: "partial", stale: true });
    expect(failed.smartSignals?.conditionsStatus).toBe("stale");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps shared weather current when the other owning group has fresher evidence", async () => {
    const payload = (group: "signals" | "roads", status: "partial" | "current") => new Response(JSON.stringify({
      smartSignals: { conditionsStatus: "current", activeWeatherAlert: false, marketsOpenTodayCount: 1, roadsTrendingLongerCount: 0 },
      sourceHealth: { [group]: { status, unavailable: status === "partial" ? ["Road context"] : [], asOf: new Date().toISOString() } },
    }));
    const fetchMock = vi.fn().mockImplementationOnce(() => Promise.resolve(payload("signals", "partial")))
      .mockImplementationOnce(() => Promise.resolve(payload("signals", "partial")))
      .mockImplementationOnce(() => Promise.resolve(payload("roads", "current")))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await loadMapLayers(["signals"]);
    vi.setSystemTime(new Date(NOW.getTime() + 60_000)); await loadMapLayers(["signals"]);
    vi.setSystemTime(new Date(NOW.getTime() + 90_000)); await loadMapLayers(["roads"]);
    vi.setSystemTime(new Date(NOW.getTime() + 120_000));
    const failed = await loadMapLayers(["signals"], { onlyExpired: true });
    expect(failed.sourceHealth.signals?.stale).toBe(true);
    expect(failed.smartSignals?.conditionsStatus).toBe("current");
    expect(failed.sourceHealth.roads).toMatchObject({ status: "current", asOf: "2026-10-06T20:01:30.000Z" });
  });

  it("preserves unavailable weather instead of turning it into an aged available snapshot", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      smartSignals: { conditionsStatus: "unavailable", activeWeatherAlert: false, marketsOpenTodayCount: 1, roadsTrendingLongerCount: 0 },
      sourceHealth: { signals: { status: "partial", unavailable: ["Weather"], asOf: NOW.toISOString() } },
    }))).mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await loadMapLayers(["signals"]);
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    const failed = await loadMapLayers(["signals"], { onlyExpired: true });
    expect(failed.smartSignals?.conditionsStatus).toBe("unavailable");
  });

  it("keeps older useful data, its timestamp, and an unverified condition state on refresh failure", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(signals(2)).mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await loadMapLayers(["signals"]);
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    const old = await loadMapLayers(["signals"], { onlyExpired: true });
    expect(old.smartSignals).toMatchObject({ conditionsStatus: "stale", marketsOpenTodayCount: 2 });
    expect(old.sourceHealth.signals).toMatchObject({ status: "partial", stale: true, asOf: NOW.toISOString(), unavailable: ["Map data service"] });
    await loadMapLayers(["signals"], { onlyExpired: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not reset the clock when an edge response is already older than its interval", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(signals(1, NOW.toISOString(), { Age: "120" })));
    const old = await loadMapLayers(["signals"]);
    expect(old.sourceHealth.signals?.stale).toBe(true);
    expect(old.smartSignals?.conditionsStatus).toBe("stale");
  });

  it.each(["headers", "body"])("bounds slow %s and ignores a late result after newer success", async (phase) => {
    let resolveLate!: (value: unknown) => void;
    const late = new Promise((resolve) => { resolveLate = resolve; });
    const fetchMock = vi.fn().mockResolvedValueOnce(signals(1));
    if (phase === "headers") fetchMock.mockReturnValueOnce(late);
    else fetchMock.mockResolvedValueOnce({ ok: true, json: () => late, headers: new Headers() });
    fetchMock.mockImplementation(() => Promise.resolve(signals(3)));
    vi.stubGlobal("fetch", fetchMock);
    await loadMapLayers(["signals"]);
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    const pending = loadMapLayers(["signals"]);
    await vi.advanceTimersByTimeAsync(8_000);
    expect((await pending).sourceHealth.signals?.stale).toBe(true);
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
    const fresh = await loadMapLayers(["signals"]);
    resolveLate(phase === "headers" ? signals(999) : JSON.parse(await signals(999).text()));
    await Promise.resolve(); await Promise.resolve();
    expect((await loadMapLayers(["signals"])).smartSignals?.marketsOpenTodayCount).toBe(3);
    expect(fresh.sourceHealth.signals?.stale).not.toBe(true);
  });

  it("retires a reset request without deleting or replacing its newer in-flight owner", async () => {
    let resolveOld!: (value: Response) => void;
    let resolveNew!: (value: Response) => void;
    const fetchMock = vi.fn().mockReturnValueOnce(new Promise<Response>((resolve) => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise<Response>((resolve) => { resolveNew = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const old = loadMapLayers(["signals"]);
    resetMapLayersRequest();
    const newer = loadMapLayers(["signals"]);
    resolveOld(signals(999));
    await old;
    const joined = loadMapLayers(["signals"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolveNew(signals(2));
    await expect(Promise.all([newer, joined])).resolves.toMatchObject([
      { smartSignals: { marketsOpenTodayCount: 2 } }, { smartSignals: { marketsOpenTodayCount: 2 } },
    ]);
  });
});


describe("borrowed context after first specialist transport failure", () => {
  it.each(["parking", "amenities"] as const)("keeps the context assembly age for retained %s", async (group) => {
    const at="2026-10-06T20:00:00Z";
    vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ [group]: [{ id:"catalog-one",slug:"catalog-one" }], sourceHealth:{context:{status:"current",unavailable:[],asOf:at}} }))).mockRejectedValueOnce(new Error("offline")));
    await loadMapLayers(["context"]);
    const result=await loadMapLayers([group]);
    expect(result[group]).toHaveLength(1);
    expect(result.sourceHealth[group]).toMatchObject({status:"partial",stale:true,asOf:at});
  });
});


describe("specialist authority across actual request ordering", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-06T20:00:00Z")); });
  const firstTime = "2026-10-06T20:00:00.000Z";
  const contextTime = "2026-10-06T20:00:01.000Z";
  const response = (value: unknown) => new Response(JSON.stringify(value));

  it.each(["parking", "amenities"] as const)("keeps healthy empty %s authoritative after expiry, transport failure, and context arrival", async (group) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ sourceHealth: { [group]: { status: "current", unavailable: [], asOf: firstTime } } }))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(response({ [group]: [{ id: "old-catalog", slug: "old-catalog" }], sourceHealth: { context: { status: "current", unavailable: [], asOf: firstTime } } }));
    vi.stubGlobal("fetch", fetchMock);
    await loadMapLayers([group]);
    vi.setSystemTime(new Date(Date.parse(firstTime) + (group === "parking" ? 60_000 : 900_000)));
    await loadMapLayers([group], { onlyExpired: true });
    const result = await loadMapLayers(["context"]);
    expect(result[group]).toEqual([]);
    expect(result.sourceHealth[group]).toMatchObject({ status: "unavailable", stale: true, asOf: firstTime });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(["parking", "amenities"] as const)("keeps retained %s context A and its age until specialist recovery despite later context B", async (group) => {
    const point = (name: string) => ({ id: "catalog-one", slug: "catalog-one", name, lng: -77.4, lat: 39.4, kind: "water", available: null, updated: null });
    const contextBTime = "2026-10-06T20:05:01.000Z";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ sourceHealth: { [group]: { status: "unavailable", unavailable: ["Specialist source"], asOf: firstTime } } }))
      .mockResolvedValueOnce(response({ [group]: [point("Context A")], sourceHealth: { context: { status: "current", unavailable: [], asOf: contextTime } } }))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(response({ [group]: [point("Context B")], sourceHealth: { context: { status: "current", unavailable: [], asOf: contextBTime } } }))
      .mockResolvedValueOnce(response({ [group]: [point("Specialist recovered")], sourceHealth: { [group]: { status: "current", unavailable: [], asOf: contextBTime } } }));
    vi.stubGlobal("fetch", fetchMock);
    await loadMapLayers([group]);
    vi.setSystemTime(new Date(contextTime));
    await loadMapLayers(["context"]);
    await loadMapLayers([group]);
    vi.setSystemTime(new Date(contextBTime));
    const retained = await loadMapLayers(["context"], { onlyExpired: true });
    expect(retained[group][0].name).toBe("Context A");
    expect(retained.sourceHealth[group]).toMatchObject({ status: "partial", stale: true, asOf: contextTime });
    const recovered = await loadMapLayers([group]);
    expect(recovered[group][0].name).toBe("Specialist recovered");
    expect(recovered.sourceHealth[group]).toMatchObject({ status: "current", asOf: contextBTime });
    expect(recovered.sourceHealth[group]?.stale).not.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it.each(["parking", "amenities"] as const)("does not make an empty partial first %s check authoritative when it expires", async (group) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ sourceHealth: { [group]: { status: "partial", unavailable: ["Specialist source"], asOf: firstTime } } }))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(response({ [group]: [{ id: "catalog-one", slug: "catalog-one" }], sourceHealth: { context: { status: "current", unavailable: [], asOf: firstTime } } }));
    vi.stubGlobal("fetch", fetchMock);
    await loadMapLayers([group]);
    vi.setSystemTime(new Date(Date.parse(firstTime) + (group === "parking" ? 60_000 : 900_000)));
    await loadMapLayers([group], { onlyExpired: true });
    const result = await loadMapLayers(["context"]);
    expect(result[group]).toHaveLength(1);
    expect(result.sourceHealth[group]?.status).toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(["parking", "amenities"] as const)("retains the actual fallback age when %s fails before and after context arrives", async (group) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ sourceHealth: { [group]: { status: "unavailable", unavailable: ["Specialist source"], asOf: firstTime } } }))
      .mockResolvedValueOnce(response({ [group]: [{ id: "catalog-one", slug: "catalog-one" }], sourceHealth: { context: { status: "current", unavailable: [], asOf: contextTime } } }))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await loadMapLayers([group]);
    vi.setSystemTime(new Date(contextTime));
    await loadMapLayers(["context"]);
    const result = await loadMapLayers([group]);
    expect(result[group]).toHaveLength(1);
    expect(result.sourceHealth[group]).toMatchObject({ status: "partial", stale: true, asOf: contextTime });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

// The previous empty result owns no older visible data to age new additions.
describe("fresh partial data after a checked empty snapshot", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-06T20:00:00Z")); });
  it.each(["parking", "amenities"] as const)("keeps the new %s assembly timestamp after expiry", async (group) => {
    const firstTime = "2026-10-06T20:00:00.000Z";
    const nextTime = "2026-10-06T20:15:00.000Z";
    const point = { id: "fresh-one", slug: "fresh-one", name: "Fresh source point", lng: -77.4, lat: 39.4, kind: "water", available: 12, updated: nextTime };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sourceHealth: { [group]: { status: "current", unavailable: [], asOf: firstTime } } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ [group]: [point], sourceHealth: { [group]: { status: "partial", unavailable: ["Other source"], asOf: nextTime } } })));
    vi.stubGlobal("fetch", fetchMock);
    expect((await loadMapLayers([group]))[group]).toEqual([]);
    vi.setSystemTime(new Date(nextTime));
    const result = await loadMapLayers([group], { onlyExpired: true });
    expect(result[group]).toEqual([point]);
    expect(result.sourceHealth[group]).toMatchObject({ status: "partial", asOf: nextTime, unavailable: ["Other source"] });
    expect(result.sourceHealth[group]?.stale).not.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("checked empty authority through an empty partial retry", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-06T20:00:00Z")); });
  it.each(["parking", "amenities"] as const)("keeps older context from resurrecting empty %s", async (group) => {
    const firstTime = "2026-10-06T20:00:00.000Z";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sourceHealth: { [group]: { status: "current", unavailable: [], asOf: firstTime } } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sourceHealth: { [group]: { status: "partial", unavailable: ["Other source"], asOf: "2026-10-06T20:00:01.000Z" } } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ [group]: [{ id: "old-catalog", slug: "old-catalog" }], sourceHealth: { context: { status: "current", unavailable: [], asOf: firstTime } } })));
    vi.stubGlobal("fetch", fetchMock);
    await loadMapLayers([group]); vi.setSystemTime(new Date("2026-10-06T20:15:00Z"));
    await loadMapLayers([group]);
    const result = await loadMapLayers(["context"]);
    expect(result[group]).toEqual([]);
    expect(result.sourceHealth[group]).toMatchObject({ status: "partial", stale: true, asOf: firstTime });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
