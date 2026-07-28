import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
  parseICalResult: vi.fn(),
  upsertEvent: vi.fn(),
  verifyCronAuth: vi.fn(),
  revalidateTag: vi.fn(),
  startIngestRun: vi.fn(),
  finishIngestRun: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
}));
vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));
vi.mock("@/lib/ingest/parser", () => ({
  parseICalResult: mocks.parseICalResult,
}));
vi.mock("@/lib/ingest/upsert", () => ({
  emptyStats: () => ({
    rawInserted: 0,
    rawUpdated: 0,
    rawUnchanged: 0,
    normUpserted: 0,
    unparseableLocations: 0,
  }),
  upsertEvent: mocks.upsertEvent,
}));
vi.mock("@/lib/ingest/run-log", () => ({
  startIngestRun: mocks.startIngestRun,
  finishIngestRun: mocks.finishIngestRun,
}));
vi.mock("../_auth", () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));
vi.mock("@/../config/civicengage_sources.json", () => ({
  default: [
    {
      municipality: "Testville",
      domain: "www.testville.gov",
      enabled: true,
      catids: [14, 23, 27],
      category_map: {
        "14": "Town Calendar",
        "23": "Parks & Recreation",
        "27": "Events Around Town",
      },
    },
  ],
}));

import { GET } from "./route";

function request(query = "") {
  return new NextRequest(
    `https://frederickradius.app/api/ingest/civicengage${query}`,
  );
}

function response(body = "BEGIN:VCALENDAR") {
  return new Response(body, { status: 200 });
}

function catIdFrom(value: string): string {
  return new URL(value).searchParams.get("catID") ?? "unknown";
}

describe("GET /api/ingest/civicengage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsertEvent.mockReset().mockResolvedValue(undefined);
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.getSql.mockReturnValue(() => undefined);
    mocks.startIngestRun.mockImplementation(async (slug: string) =>
      slug === "civicengage:aggregate"
        ? "run-aggregate"
        : "run-testville",
    );
    mocks.finishIngestRun.mockResolvedValue(undefined);
    mocks.parseICalResult.mockImplementation((body: string) => ({
      valid: true,
      events: [{ uid: `event-${catIdFrom(body)}` }],
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(response(url)),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("records unique healthy heartbeats and retains warm caches when content is unchanged", async () => {
    mocks.upsertEvent.mockImplementation(
      async (
        _sql: unknown,
        _source: unknown,
        _event: unknown,
        stats: { rawUnchanged: number },
      ) => {
        stats.rawUnchanged += 1;
      },
    );

    const result = await GET(request());
    const body = await result.json();

    expect(result.status).toBe(200);
    expect(mocks.startIngestRun).toHaveBeenCalledWith(
      "civicengage:aggregate",
    );
    expect(mocks.startIngestRun).toHaveBeenCalledWith(
      "civicengage:www.testville.gov",
    );
    expect(mocks.finishIngestRun).toHaveBeenCalledWith("run-testville", {
      status: "ok",
      records_in: 3,
      records_upserted: 0,
      records_failed: 0,
      error: undefined,
    });
    expect(mocks.finishIngestRun).toHaveBeenCalledWith("run-aggregate", {
      status: "ok",
      records_in: 3,
      records_upserted: 0,
      records_failed: 0,
      error: undefined,
    });
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      status: "ok",
      totalParsed: 3,
      totalDuplicates: 0,
      totalChanged: 0,
      cache: { invalidated: false },
      geocode: {
        status: "not_run",
        mode: "separate_schedule",
        scheduled: false,
      },
    });
    expect(body.perSource.Testville).toMatchObject({
      status: "ok",
      ok: true,
      events: 3,
      duplicates: 0,
      fetchStatus: "ok",
      contentStatus: "unchanged",
      feeds: { requested: 3, fetched: 3, failed: 0 },
      records: { processed: 3, failed: 0 },
      stats: { rawUnchanged: 3, normUpserted: 0 },
    });
  });

  it("records partial fetch coverage and invalidates caches when valid rows changed", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      const value = String(url);
      return catIdFrom(value) === "23"
        ? new Response("", { status: 502 })
        : response(value);
    });
    mocks.upsertEvent.mockImplementation(
      async (
        _sql: unknown,
        _source: unknown,
        _event: unknown,
        stats: { rawInserted: number; normUpserted: number },
      ) => {
        stats.rawInserted += 1;
        stats.normUpserted += 1;
      },
    );

    const result = await GET(request());
    const body = await result.json();

    expect(mocks.finishIngestRun).toHaveBeenCalledWith("run-testville", {
      status: "partial",
      records_in: 2,
      records_upserted: 2,
      records_failed: 1,
      error: "1 of 3 category feeds failed (catID 23: HTTP 502)",
    });
    expect(mocks.finishIngestRun).toHaveBeenCalledWith(
      "run-aggregate",
      expect.objectContaining({
        status: "partial",
        records_in: 2,
        records_upserted: 2,
        records_failed: 1,
      }),
    );
    expect(mocks.revalidateTag).toHaveBeenNthCalledWith(
      1,
      "ingested-events",
      "max",
    );
    expect(mocks.revalidateTag).toHaveBeenNthCalledWith(
      2,
      "events",
      "max",
    );
    expect(
      mocks.upsertEvent.mock.calls.every(
        ([, opts]) =>
          (opts as { categoryCoverageComplete?: boolean })
            .categoryCoverageComplete === false,
      ),
    ).toBe(true);
    expect(body).toMatchObject({
      status: "partial",
      totalChanged: 2,
      cache: { invalidated: true },
      perSource: {
        Testville: {
          status: "partial",
          ok: false,
          fetchStatus: "partial",
          contentStatus: "changed",
          feeds: { requested: 3, fetched: 2, failed: 1 },
        },
      },
    });
  });

  it("records an error heartbeat when every configured feed fails", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 503 }));

    const result = await GET(request());
    const body = await result.json();

    expect(result.status).toBe(502);
    expect(mocks.upsertEvent).not.toHaveBeenCalled();
    expect(mocks.finishIngestRun).toHaveBeenCalledWith("run-testville", {
      status: "error",
      records_in: 0,
      records_upserted: 0,
      records_failed: 3,
      error:
        "all 3 category feeds failed (catID 14: HTTP 503, catID 23: HTTP 503, catID 27: HTTP 503)",
    });
    expect(body).toMatchObject({
      status: "error",
      totalFailed: 3,
      cache: { invalidated: false },
      perSource: {
        Testville: {
          status: "error",
          ok: false,
          events: 0,
          fetchStatus: "failed",
          contentStatus: "not_checked",
          feeds: { requested: 3, fetched: 0, failed: 3 },
        },
      },
    });
  });

  it("treats a malformed HTTP 200 calendar as a feed failure", async () => {
    mocks.parseICalResult.mockImplementation((body: string) =>
      catIdFrom(body) === "14"
        ? {
            valid: false,
            events: [],
            error: "invalid iCalendar payload",
          }
        : {
            valid: true,
            events: [{ uid: `event-${catIdFrom(body)}` }],
          },
    );

    const result = await GET(request());
    const body = await result.json();

    expect(mocks.finishIngestRun).toHaveBeenCalledWith(
      "run-testville",
      expect.objectContaining({
        status: "partial",
        records_in: 2,
        records_failed: 1,
        error:
          "1 of 3 category feeds failed (catID 14: invalid iCalendar payload)",
      }),
    );
    expect(body.perSource.Testville).toMatchObject({
      status: "partial",
      events: 2,
      fetchStatus: "partial",
      feeds: { requested: 3, fetched: 2, failed: 1 },
    });
  });

  it("deduplicates UIDs before writes and nulls conflicting categories deterministically", async () => {
    mocks.parseICalResult.mockReturnValue({
      valid: true,
      events: [{ uid: "shared-event" }],
    });

    const result = await GET(request());
    const body = await result.json();

    expect(mocks.upsertEvent).toHaveBeenCalledOnce();
    expect(mocks.upsertEvent).toHaveBeenCalledWith(
      expect.anything(),
      {
        sourceDomain: "www.testville.gov",
        municipality: "Testville",
        category: null,
        categoryCoverageComplete: true,
      },
      { uid: "shared-event" },
      expect.anything(),
    );
    expect(mocks.finishIngestRun).toHaveBeenCalledWith(
      "run-testville",
      expect.objectContaining({
        records_in: 1,
        records_failed: 0,
      }),
    );
    expect(body).toMatchObject({
      totalParsed: 1,
      totalDuplicates: 2,
      perSource: {
        Testville: {
          events: 1,
          duplicates: 2,
          records: { processed: 1, failed: 0 },
        },
      },
    });
  });

  it("records a poison row but continues writing later unique records", async () => {
    mocks.upsertEvent
      .mockImplementationOnce(
        async (
          _sql: unknown,
          _source: unknown,
          _event: unknown,
          stats: { rawInserted: number; normUpserted: number },
        ) => {
          stats.rawInserted += 1;
          stats.normUpserted += 1;
        },
      )
      .mockRejectedValueOnce(new Error("database unavailable"));

    const result = await GET(request());
    const body = await result.json();

    expect(result.status).toBe(200);
    expect(mocks.upsertEvent).toHaveBeenCalledTimes(3);
    expect(mocks.upsertEvent.mock.calls[2][2]).toEqual({ uid: "event-27" });
    expect(mocks.finishIngestRun).toHaveBeenCalledWith("run-testville", {
      status: "partial",
      records_in: 3,
      records_upserted: 1,
      records_failed: 1,
      error: "1 unique record failed (event-23: database unavailable)",
    });
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(2);
    expect(body.perSource.Testville).toMatchObject({
      status: "partial",
      contentStatus: "partial",
      records: { processed: 2, failed: 1 },
    });
  });

  it("limits concurrent requests to two feeds per source", async () => {
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];
    vi.mocked(fetch).mockImplementation(
      (url) =>
        new Promise<Response>((resolve) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          releases.push(() => {
            active -= 1;
            resolve(response(String(url)));
          });
        }),
    );

    const run = GET(request());
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(maxActive).toBe(2);

    releases.shift()?.();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(maxActive).toBe(2);

    for (const release of releases.splice(0)) release();
    await run;
  });

  it("stops before new work at the route deadline and records honest errors", async () => {
    const now = vi
      .spyOn(Date, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValue(241_001);

    const result = await GET(request());
    const body = await result.json();

    expect(result.status).toBe(502);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.upsertEvent).not.toHaveBeenCalled();
    expect(mocks.finishIngestRun).toHaveBeenCalledWith(
      "run-testville",
      expect.objectContaining({
        status: "error",
        records_in: 0,
        records_failed: 3,
      }),
    );
    expect(body).toMatchObject({
      status: "error",
      deadlineReached: true,
      totalFailed: 3,
      cache: { invalidated: false },
    });
    now.mockRestore();
  });

  it("preserves fetch and dedupe behavior without writes during a dry run", async () => {
    mocks.parseICalResult.mockReturnValue({
      valid: true,
      events: [{ uid: "shared-event" }],
    });

    const result = await GET(request("?dry=1"));
    const body = await result.json();

    expect(mocks.startIngestRun).not.toHaveBeenCalled();
    expect(mocks.finishIngestRun).not.toHaveBeenCalled();
    expect(mocks.upsertEvent).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      dry: true,
      status: "ok",
      totalParsed: 1,
      totalDuplicates: 2,
      perSource: {
        Testville: {
          events: 1,
          contentStatus: "not_checked",
          records: { processed: 0, failed: 0 },
        },
      },
    });
    expect(body.totalChanged).toBeUndefined();
  });

  it("does not replace the all-source heartbeat during a manual source-only run", async () => {
    await GET(request("?only=Testville"));

    expect(mocks.startIngestRun).not.toHaveBeenCalledWith(
      "civicengage:aggregate",
    );
    expect(mocks.finishIngestRun).not.toHaveBeenCalledWith(
      "run-aggregate",
      expect.anything(),
    );
    expect(mocks.startIngestRun).toHaveBeenCalledWith(
      "civicengage:www.testville.gov",
    );
  });
});
