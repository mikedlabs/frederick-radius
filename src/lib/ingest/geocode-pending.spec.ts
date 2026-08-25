import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/data/places", () => ({ PLACES: [] }));

const mocks = vi.hoisted(() => ({
  finalizeIdempotentDailyUsage: vi.fn(),
  lookupOfficialCountyAddress: vi.fn(),
  reserveIdempotentDailyUsage: vi.fn(),
}));

vi.mock("@/lib/ingest/fc-address-lookup", () => ({
  lookupOfficialCountyAddress: mocks.lookupOfficialCountyAddress,
}));
vi.mock("@/lib/usage-meter", () => ({
  finalizeIdempotentDailyUsage: mocks.finalizeIdempotentDailyUsage,
  reserveIdempotentDailyUsage: mocks.reserveIdempotentDailyUsage,
}));

import {
  geocodePending,
  VERIFIED_CATALOG_CACHE_SOURCE,
  VERIFIED_FREDERICK_COUNTY_CACHE_SOURCE,
  VERIFIED_GOOGLE_CACHE_SOURCE,
} from "@/lib/ingest/geocode";
import { normalizeForCache } from "@/lib/ingest/location";

type PendingRow = {
  id: string;
  address: string;
  source_domain: string;
  source_uid: string;
  has_stale_review: boolean;
};

type SqlCall = [TemplateStringsArray, ...unknown[]];

const BASE_EVENT: PendingRow = {
  id: "event-1",
  address: "1 Test Street, Frederick, MD",
  source_domain: "calendar.example",
  source_uid: "source-event-1",
  has_stale_review: false,
};

function queryText(strings: TemplateStringsArray): string {
  return Array.from(strings).join(" ");
}

function createSql(
  pending: PendingRow[] = [BASE_EVENT],
  cacheRows: Array<{
    lat: number | string;
    lng: number | string;
    source: string;
    cached_at?: string | Date;
  }> = [],
  cacheRowsByAddress: ReadonlyMap<
    string,
    Array<{
      lat: number | string;
      lng: number | string;
      source: string;
      cached_at?: string | Date;
    }>
  > = new Map(),
) {
  return vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = queryText(strings);
    if (query.includes("select e.id")) return Promise.resolve(pending);
    if (query.includes("select lat, lng, source, cached_at from venue_geocache")) {
      return Promise.resolve(
        cacheRowsByAddress.get(String(values[0])) ?? cacheRows,
      );
    }
    return Promise.resolve([]);
  });
}

function matchingCalls(
  sql: ReturnType<typeof createSql>,
  needle: string,
): SqlCall[] {
  return sql.mock.calls.filter(([strings]) =>
    queryText(strings).includes(needle),
  ) as SqlCall[];
}

function googlePayload(
  lng: number,
  lat: number,
  options: { status?: string; types?: string[]; locationType?: string } = {},
) {
  return {
    status: options.status ?? "OK",
    results: [
      {
        types: options.types ?? ["street_address"],
        geometry: {
          location: { lat, lng },
          location_type: options.locationType ?? "ROOFTOP",
        },
      },
    ],
  };
}

describe("geocodePending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lookupOfficialCountyAddress.mockReset().mockResolvedValue({
      status: "not_found",
      reason: "no_exact_match",
      normalizedAddress: "1 TEST ST, FREDERICK, MD",
    });
    process.env.GOOGLE_GEOCODING_API_KEY = "test-geocoding-key";
    process.env.GOOGLE_GEOCODING_ENABLED = "1";
    process.env.GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL =
      "written-google-authorization-confirmed";
    process.env.GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED = "1";
    mocks.reserveIdempotentDailyUsage.mockResolvedValue({
      reserved: true,
      count: 1,
      duplicate: false,
    });
    mocks.finalizeIdempotentDailyUsage.mockResolvedValue({
      finalized: true,
      state: "succeeded",
    });
  });

  afterEach(() => {
    delete process.env.GOOGLE_GEOCODING_API_KEY;
    delete process.env.GOOGLE_GEOCODING_ENABLED;
    delete process.env.GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL;
    delete process.env.GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED;
    delete process.env.GOOGLE_EVENT_GEOCODE_DAILY_LIMIT;
    vi.unstubAllGlobals();
  });

  it("selects only current work and skips addresses already in review", async () => {
    const sql = createSql([]);

    await geocodePending(sql as never, 17);

    const [pendingCall] = matchingCalls(sql, "select e.id");
    const text = queryText(pendingCall[0]);
    expect(text).toContain(
      "coalesce(e.ends_at_utc, e.starts_at_utc) >= now() - interval '6 hours'",
    );
    expect(text).toContain("reviewed_address.raw_location = e.address");
    expect(text).toContain(
      "reviewed_address.seen_at >= now() - interval '30 days'",
    );
    expect(pendingCall.slice(1)).toEqual([17]);
  });

  it("queues a definitive boundary rejection with source-scoped parameters", async () => {
    const sql = createSql();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(googlePayload(-76.6122, 39.2904))),
      ),
    );

    const result = await geocodePending(sql as never, 1);

    expect(result).toMatchObject({ fromApi: 0, failed: 1 });
    const queueCalls = matchingCalls(sql, "insert into unparseable_locations");
    expect(queueCalls).toHaveLength(1);
    expect(queueCalls[0].slice(1)).toEqual([
      BASE_EVENT.source_domain,
      BASE_EVENT.source_uid,
      BASE_EVENT.address,
    ]);
    expect(matchingCalls(sql, "update ingested_events")).toHaveLength(0);
  });

  it("deduplicates one rejected address across occurrences in the same batch", async () => {
    const second = {
      ...BASE_EVENT,
      id: "event-2",
      source_uid: "source-event-2",
    };
    const sql = createSql([BASE_EVENT, second]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ status: "ZERO_RESULTS", results: [] }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodePending(sql as never, 2);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.failed).toBe(2);
    expect(matchingCalls(sql, "insert into unparseable_locations")).toHaveLength(2);
  });

  it("does not queue quota/auth/upstream failures and stops the batch", async () => {
    const second = {
      ...BASE_EVENT,
      id: "event-2",
      address: "2 Test Street, Frederick, MD",
      source_uid: "source-event-2",
    };
    const sql = createSql([BASE_EVENT, second]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ status: "OVER_QUERY_LIMIT", results: [] }),
        { status: 429 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodePending(sql as never, 2);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      failed: 1,
      status: "degraded",
      degradedReason: "quota",
      upstreamStatus: 429,
    });
    expect(matchingCalls(sql, "insert into unparseable_locations")).toHaveLength(0);
    expect(matchingCalls(sql, "update ingested_events")).toHaveLength(0);
  });

  it("publishes a precise match with exact cache and event parameters", async () => {
    const sql = createSql();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(googlePayload(-77.4109, 39.4137))),
      ),
    );

    const result = await geocodePending(sql as never, 1);

    expect(result).toMatchObject({ fromApi: 1, failed: 0 });
    const cacheWrites = matchingCalls(sql, "insert into venue_geocache");
    expect(cacheWrites).toHaveLength(1);
    expect(cacheWrites[0].slice(1)).toEqual([
      normalizeForCache(BASE_EVENT.address),
      39.4137,
      -77.4109,
      VERIFIED_GOOGLE_CACHE_SOURCE,
    ]);

    const eventWrites = matchingCalls(sql, "update ingested_events");
    expect(eventWrites).toHaveLength(1);
    expect(eventWrites[0].slice(1)).toEqual([
      39.4137,
      -77.4109,
      BASE_EVENT.id,
    ]);
    expect(matchingCalls(sql, "delete from unparseable_locations")).toHaveLength(0);
  });

  it("cleans a stale review only after a changed-address success", async () => {
    const changed = { ...BASE_EVENT, has_stale_review: true };
    const sql = createSql([changed]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(googlePayload(-77.4109, 39.4137))),
      ),
    );

    await geocodePending(sql as never, 1);

    const deletes = matchingCalls(sql, "delete from unparseable_locations");
    expect(deletes).toHaveLength(1);
    expect(deletes[0].slice(1)).toEqual([
      changed.source_domain,
      changed.source_uid,
    ]);
  });

  it("uses only a current trusted cache source without calling Google", async () => {
    const sql = createSql(
      [BASE_EVENT],
      [{
        lat: "39.413700",
        lng: "-77.410900",
        source: VERIFIED_CATALOG_CACHE_SOURCE,
      }],
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodePending(sql as never, 1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.lookupOfficialCountyAddress).not.toHaveBeenCalled();
    expect(result).toMatchObject({ fromCache: 1, fromApi: 0, failed: 0 });
    expect(matchingCalls(sql, "update ingested_events")[0].slice(1)).toEqual([
      39.4137,
      -77.4109,
      BASE_EVENT.id,
    ]);
  });

  it("checks the official County source before reusing a current Google cache row", async () => {
    const sql = createSql(
      [BASE_EVENT],
      [{
        lat: "39.413700",
        lng: "-77.410900",
        source: VERIFIED_GOOGLE_CACHE_SOURCE,
        cached_at: new Date().toISOString(),
      }],
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodePending(sql as never, 1);

    expect(mocks.lookupOfficialCountyAddress).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ fromCache: 1, fromOfficial: 0, fromApi: 0 });
    expect(matchingCalls(sql, "update ingested_events")[0].slice(1)).toEqual([
      39.4137,
      -77.4109,
      BASE_EVENT.id,
    ]);
  });

  it("revalidates a stale County cache row instead of treating it as durable", async () => {
    mocks.lookupOfficialCountyAddress.mockResolvedValue({
      status: "match",
      source: "frederick_county_address_points",
      normalizedAddress: "1 TEST ST, FREDERICK, MD",
      officialAddress: "1 TEST ST",
      coordinate: { lat: 39.414, lng: -77.411 },
      objectId: 43,
      sourceRecords: 1,
    });
    const sql = createSql(
      [BASE_EVENT],
      [{
        lat: "39.413700",
        lng: "-77.410900",
        source: VERIFIED_FREDERICK_COUNTY_CACHE_SOURCE,
        cached_at: "2026-01-01T00:00:00.000Z",
      }],
    );

    const result = await geocodePending(sql as never, 1);

    expect(mocks.lookupOfficialCountyAddress).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ fromOfficial: 1, fromCache: 0 });
    expect(matchingCalls(sql, "update ingested_events")[0].slice(1)).toEqual([
      39.414,
      -77.411,
      BASE_EVENT.id,
    ]);
  });

  it("publishes and caches an exact official County address without calling Google", async () => {
    mocks.lookupOfficialCountyAddress.mockResolvedValue({
      status: "match",
      source: "frederick_county_address_points",
      normalizedAddress: "1 TEST ST, FREDERICK, MD",
      officialAddress: "1 TEST ST",
      coordinate: { lat: 39.4137, lng: -77.4109 },
      objectId: 42,
      sourceRecords: 1,
    });
    const sql = createSql();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodePending(sql as never, 1);

    expect(mocks.lookupOfficialCountyAddress).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      fromOfficial: 1,
      fromApi: 0,
      failed: 0,
      status: "ok",
    });
    expect(matchingCalls(sql, "insert into venue_geocache")[0].slice(1)).toEqual([
      normalizeForCache(BASE_EVENT.address),
      39.4137,
      -77.4109,
      VERIFIED_FREDERICK_COUNTY_CACHE_SOURCE,
    ]);
    expect(matchingCalls(sql, "update ingested_events")[0].slice(1)).toEqual([
      39.4137,
      -77.4109,
      BASE_EVENT.id,
    ]);
  });

  it("persists an official County miss for a bounded retry window", async () => {
    delete process.env.GOOGLE_GEOCODING_ENABLED;
    const sql = createSql();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodePending(sql as never, 1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.lookupOfficialCountyAddress).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      failed: 1,
      status: "ok",
      budgetStopped: 0,
    });
    const reviews = matchingCalls(sql, "insert into unparseable_locations");
    expect(reviews).toHaveLength(1);
    expect(reviews[0].slice(1)).toEqual([
      BASE_EVENT.source_domain,
      BASE_EVENT.source_uid,
      BASE_EVENT.address,
    ]);
    expect(matchingCalls(sql, "update ingested_events")).toHaveLength(0);
  });

  it.each([
    {
      lookup: {
        status: "ambiguous",
        reason: "multiple_exact_matches",
        normalizedAddress: "1 TEST ST, FREDERICK, MD",
        candidateCount: 2,
      },
    },
    {
      lookup: {
        status: "invalid",
        reason: "imprecise",
      },
    },
  ] as const)(
    "persists a bounded $lookup.status County outcome without paid fallback",
    async ({ lookup }) => {
      delete process.env.GOOGLE_GEOCODING_ENABLED;
      mocks.lookupOfficialCountyAddress.mockResolvedValue(lookup);
      const sql = createSql();
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const result = await geocodePending(sql as never, 1);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result).toMatchObject({ failed: 1, budgetStopped: 0 });
      expect(
        matchingCalls(sql, "insert into unparseable_locations"),
      ).toHaveLength(1);
    },
  );

  it("reports an unavailable official source without misclassifying the address", async () => {
    delete process.env.GOOGLE_GEOCODING_ENABLED;
    mocks.lookupOfficialCountyAddress.mockResolvedValue({
      status: "unavailable",
      reason: "timeout",
    });
    const sql = createSql();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodePending(sql as never, 1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      failed: 1,
      status: "degraded",
      degradedReason: "official-unavailable",
      upstreamStatus: "timeout",
    });
    expect(matchingCalls(sql, "insert into unparseable_locations")).toHaveLength(0);
    expect(matchingCalls(sql, "update ingested_events")).toHaveLength(0);
  });

  it("keeps applying later trusted cache matches after one County GIS timeout", async () => {
    delete process.env.GOOGLE_GEOCODING_ENABLED;
    mocks.lookupOfficialCountyAddress.mockResolvedValueOnce({
      status: "unavailable",
      reason: "timeout",
    });
    const cachedEvent: PendingRow = {
      ...BASE_EVENT,
      id: "event-cached-after-timeout",
      address: "2 Cached Street, Frederick, MD",
      source_uid: "source-event-cached-after-timeout",
    };
    const uncachedEvent: PendingRow = {
      ...BASE_EVENT,
      id: "event-uncached-after-timeout",
      address: "3 Uncached Street, Frederick, MD",
      source_uid: "source-event-uncached-after-timeout",
    };
    const sql = createSql(
      [BASE_EVENT, uncachedEvent, cachedEvent],
      [],
      new Map([
        [
          normalizeForCache(cachedEvent.address),
          [{
            lat: "39.413700",
            lng: "-77.410900",
            source: VERIFIED_CATALOG_CACHE_SOURCE,
          }],
        ],
      ]),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodePending(sql as never, 3);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.lookupOfficialCountyAddress).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      fromCache: 1,
      fromOfficial: 0,
      fromApi: 0,
      failed: 2,
      status: "degraded",
      degradedReason: "official-unavailable",
      upstreamStatus: "timeout",
    });
    const updates = matchingCalls(sql, "update ingested_events");
    expect(updates).toHaveLength(1);
    expect(updates[0].slice(1)).toEqual([
      39.4137,
      -77.4109,
      cachedEvent.id,
    ]);
    expect(matchingCalls(sql, "insert into unparseable_locations")).toHaveLength(0);
  });

  it("reports the County GIS kill switch as disabled, not as an outage", async () => {
    delete process.env.GOOGLE_GEOCODING_ENABLED;
    mocks.lookupOfficialCountyAddress.mockResolvedValue({
      status: "disabled",
      reason: "county_gis_disabled",
    });
    const sql = createSql();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodePending(sql as never, 1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      failed: 0,
      status: "degraded",
      degradedReason: "disabled",
      budgetStopped: 1,
    });
    expect(result.upstreamStatus).toBeUndefined();
    expect(matchingCalls(sql, "insert into unparseable_locations")).toHaveLength(0);
    expect(matchingCalls(sql, "update ingested_events")).toHaveLength(0);
  });

  it("keeps applying later trusted cache matches while Google is disabled", async () => {
    delete process.env.GOOGLE_GEOCODING_ENABLED;
    const cachedEvent: PendingRow = {
      ...BASE_EVENT,
      id: "event-cached",
      address: "2 Cached Street, Frederick, MD",
      source_uid: "source-event-cached",
    };
    const cachedNorm = normalizeForCache(cachedEvent.address);
    const sql = createSql(
      [BASE_EVENT, cachedEvent],
      [],
      new Map([
        [
          cachedNorm,
          [{
            lat: "39.413700",
            lng: "-77.410900",
            source: VERIFIED_CATALOG_CACHE_SOURCE,
          }],
        ],
      ]),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodePending(sql as never, 2);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      fromCache: 1,
      fromApi: 0,
      failed: 1,
      status: "ok",
      budgetStopped: 0,
    });
    const updates = matchingCalls(sql, "update ingested_events");
    expect(updates).toHaveLength(1);
    expect(updates[0].slice(1)).toEqual([
      39.4137,
      -77.4109,
      cachedEvent.id,
    ]);
    expect(matchingCalls(sql, "insert into unparseable_locations")).toHaveLength(1);
  });

  it("does not start a Google call without a full route-budget window", async () => {
    const sql = createSql();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodePending(sql as never, 1, {
      deadlineAt: Date.now() + 1_000,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "degraded",
      degradedReason: "route-budget",
      budgetStopped: 1,
      failed: 0,
    });
    expect(matchingCalls(sql, "insert into unparseable_locations")).toHaveLength(0);
    expect(matchingCalls(sql, "update ingested_events")).toHaveLength(0);
  });

  it("stops honestly when the shared provider budget cannot be verified", async () => {
    const second = {
      ...BASE_EVENT,
      id: "event-2",
      address: "2 Test Street, Frederick, MD",
      source_uid: "source-event-2",
    };
    const sql = createSql([BASE_EVENT, second]);
    mocks.reserveIdempotentDailyUsage.mockResolvedValueOnce(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodePending(sql as never, 2);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      failed: 0,
      status: "degraded",
      degradedReason: "budget-unavailable",
      budgetStopped: 2,
    });
    expect(matchingCalls(sql, "insert into unparseable_locations")).toHaveLength(0);
  });

  it("skips only a duplicate address claim and continues with later work", async () => {
    const second = {
      ...BASE_EVENT,
      id: "event-2",
      address: "2 Test Street, Frederick, MD",
      source_uid: "source-event-2",
    };
    const sql = createSql([BASE_EVENT, second]);
    mocks.reserveIdempotentDailyUsage
      .mockResolvedValueOnce({
        reserved: false,
        count: 1,
        duplicate: true,
        duplicateState: "pending",
      })
      .mockResolvedValueOnce({
        reserved: true,
        count: 2,
        duplicate: false,
      });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(googlePayload(-77.4115, 39.4142))),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodePending(sql as never, 2);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      fromApi: 1,
      failed: 0,
      status: "degraded",
      degradedReason: "already-reserved",
      budgetStopped: 1,
    });
    const updates = matchingCalls(sql, "update ingested_events");
    expect(updates).toHaveLength(1);
    expect(updates[0].at(-1)).toBe(second.id);
  });

  it("preserves an exhausted cap as a budget stop, not bad event data", async () => {
    const sql = createSql();
    mocks.reserveIdempotentDailyUsage.mockResolvedValueOnce({
      reserved: false,
      count: 25,
      duplicate: false,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodePending(sql as never, 1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      failed: 0,
      status: "degraded",
      degradedReason: "daily-cap",
      budgetStopped: 1,
    });
    expect(matchingCalls(sql, "insert into unparseable_locations")).toHaveLength(0);
  });
});
