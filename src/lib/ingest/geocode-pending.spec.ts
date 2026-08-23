import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/data/places", () => ({ PLACES: [] }));

const usageMocks = vi.hoisted(() => ({
  meterUsage: vi.fn(),
  reserveDailyUsage: vi.fn(),
}));

vi.mock("@/lib/usage-meter", () => ({
  meterUsage: usageMocks.meterUsage,
  reserveDailyUsage: usageMocks.reserveDailyUsage,
}));

import {
  geocodePending,
  VERIFIED_CATALOG_CACHE_SOURCE,
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
  cacheRows: Array<{ lat: number | string; lng: number | string; source: string }> = [],
) {
  return vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    void values;
    const query = queryText(strings);
    if (query.includes("select e.id")) return Promise.resolve(pending);
    if (query.includes("select lat, lng, source from venue_geocache")) {
      return Promise.resolve(cacheRows);
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
    process.env.GOOGLE_PLACES_API_KEY = "test-google-key";
    usageMocks.meterUsage.mockReset();
    usageMocks.reserveDailyUsage.mockReset();
    usageMocks.reserveDailyUsage.mockResolvedValue({ reserved: true, count: 1 });
  });

  afterEach(() => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_GEOCODING_API_KEY;
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
    expect(result).toMatchObject({ fromCache: 1, fromApi: 0, failed: 0 });
    expect(matchingCalls(sql, "update ingested_events")[0].slice(1)).toEqual([
      39.4137,
      -77.4109,
      BASE_EVENT.id,
    ]);
  });

  it("does not queue or call the network when Google is disabled", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
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
    expect(matchingCalls(sql, "insert into unparseable_locations")).toHaveLength(0);
    expect(matchingCalls(sql, "update ingested_events")).toHaveLength(0);
  });

  it("stops cleanly without a provider call when the shared daily budget is exhausted", async () => {
    const sql = createSql();
    usageMocks.reserveDailyUsage.mockResolvedValue({
      reserved: false,
      count: 50,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodePending(sql as never, 1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      failed: 0,
      status: "degraded",
      degradedReason: "daily-budget",
      budgetStopped: 1,
    });
    expect(matchingCalls(sql, "insert into unparseable_locations")).toHaveLength(0);
    expect(matchingCalls(sql, "update ingested_events")).toHaveLength(0);
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
});
