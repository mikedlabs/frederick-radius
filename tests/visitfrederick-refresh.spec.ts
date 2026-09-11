import { describe, expect, it, vi } from "vitest";
import {
  refreshVisitFrederickSnapshot,
  VISIT_FREDERICK_FIRECRAWL_DAILY_LIMIT,
  type VisitFrederickRefreshDependencies,
} from "@/lib/integrations/visitfrederick-refresh";
import {
  VISIT_FREDERICK_FEED_URL,
  type VisitFrederickSnapshot,
  type VisitFrederickSnapshotReadResult,
  type VisitFrederickSnapshotReadOptions,
  type VisitFrederickSnapshotWriteResult,
} from "@/lib/integrations/visitfrederick-snapshot";
import type { VisitFrederickNativeFeedResult } from "@/lib/integrations/visitfrederick";
import type {
  FirecrawlPageSnapshot,
  FirecrawlRestOptions,
} from "../scripts/lib/firecrawl-rest";
import type {
  UsageIntervalLease,
  UsageReservation,
} from "@/lib/usage-meter";

const NOW = new Date("2026-07-31T14:00:00.000Z");
const FETCHED_AT = "2026-07-29T14:00:00.000Z";
const EMPTY_RSS =
  '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel></channel></rss>';
const EVENT_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><item>
  <title>Background Snapshot Event</title>
  <link>https://www.visitfrederick.org/event/background-snapshot/12345/</link>
  <category><![CDATA[ Downtown Frederick ]]></category>
  <description><![CDATA[
    <img src="https://assets.simpleviewinc.com/sv-frederick-county/image/fetch/example.jpg" />
    08/01/2026 to 08/01/2026 -
    <p>Publisher prose must not be retained.</p>
  ]]></description>
</item></channel></rss>`;

function factualEvent(verifiedAt = FETCHED_AT) {
  return {
    id: "vf-12345",
    title: "Stored Event",
    description: "",
    starts_at: "2026-08-01T16:00:00.000Z",
    ends_at: "2026-08-02T03:59:59.000Z",
    venue_name: "",
    address: "",
    geom: { lng: -77.4105, lat: 39.4143 },
    municipality: "frederick",
    category: "community",
    organizer: "Visit Frederick",
    source: "visit-frederick" as const,
    source_label: "Visit Frederick",
    url: "https://www.visitfrederick.org/event/stored-event/12345/",
    is_free: true,
    status: "scheduled" as const,
    last_verified_at: verifiedAt,
  };
}

function previousSnapshot(
  overrides: Partial<VisitFrederickSnapshot> = {},
): VisitFrederickSnapshot {
  return {
    version: 1,
    sourceUrl: VISIT_FREDERICK_FEED_URL,
    lastAttemptAt: "2026-07-29T14:00:00.000Z",
    sourceFetchedAt: FETCHED_AT,
    lastAttemptStatus: "ok-native",
    events: [factualEvent()],
    ...overrides,
  };
}

function firecrawlSnapshot(
  rawHtml = EVENT_RSS,
  overrides: Partial<FirecrawlPageSnapshot> = {},
): FirecrawlPageSnapshot {
  return {
    requestedUrl: VISIT_FREDERICK_FEED_URL,
    finalUrl: VISIT_FREDERICK_FEED_URL,
    text: rawHtml,
    markdown: "",
    rawHtml,
    links: [],
    metadata: {
      statusCode: 200,
      contentType: "application/rss+xml; charset=UTF-8",
    },
    ...overrides,
  };
}

function harness() {
  const readSnapshot = vi.fn(
    async (
      _options?: VisitFrederickSnapshotReadOptions,
    ): Promise<VisitFrederickSnapshotReadResult> => {
      void _options;
      return { state: "missing" };
    },
  );
  let etag = 0;
  const writeSnapshot = vi.fn(
    async (
      _snapshot: VisitFrederickSnapshot,
      _options?: { ifMatch?: string },
    ): Promise<VisitFrederickSnapshotWriteResult> => {
      void _snapshot;
      void _options;
      etag += 1;
      return {
        stored: true,
        url: "https://blob.example/visit-frederick.json",
        etag: `etag-${etag}`,
      };
    },
  );
  const fetchNative = vi.fn(
    async (): Promise<VisitFrederickNativeFeedResult> => ({
      state: "ok",
      xml: EVENT_RSS,
    }),
  );
  const fetchFirecrawl = vi.fn(
    async (
      _url: string,
      _options: FirecrawlRestOptions,
    ): Promise<FirecrawlPageSnapshot> => {
      void _url;
      void _options;
      return firecrawlSnapshot();
    },
  );
  const reserveUsage = vi.fn(
    async (
      _upstream: "firecrawl_visit_frederick",
      _limit: number,
    ): Promise<UsageReservation | null> => {
      void _upstream;
      void _limit;
      return { reserved: true, count: 1 };
    },
  );
  const reserveInterval = vi.fn(
    async (): Promise<UsageIntervalLease | null> => ({ acquired: true }),
  );
  const dependencies: VisitFrederickRefreshDependencies = {
    now: () => new Date(NOW),
    readSnapshot,
    writeSnapshot,
    fetchNative,
    fetchFirecrawl,
    reserveInterval,
    reserveUsage,
    firecrawlEnabled: true,
    firecrawlKeyPresent: true,
    reuseApproved: true,
  };
  return {
    dependencies,
    readSnapshot,
    writeSnapshot,
    fetchNative,
    fetchFirecrawl,
    reserveInterval,
    reserveUsage,
  };
}

function setPrevious(
  h: ReturnType<typeof harness>,
  previous = previousSnapshot(),
  etag = "etag-previous",
) {
  h.readSnapshot.mockResolvedValue({
    state: "ok",
    snapshot: previous,
    etag,
  });
}

describe("Visit Frederick background snapshot refresh", () => {
  it("reads the publisher natively first and never reserves a paid call on success", async () => {
    const h = harness();

    const result = await refreshVisitFrederickSnapshot(h.dependencies);

    expect(result).toMatchObject({
      ok: true,
      skipped: false,
      updated: true,
      via: "native",
      events: 1,
      status: "ok-native",
      budget: { limit: 12, reserved: false, count: null },
    });
    expect(h.readSnapshot).toHaveBeenCalledWith({ cacheMode: "origin-fresh" });
    expect(h.reserveUsage).not.toHaveBeenCalled();
    expect(h.fetchFirecrawl).not.toHaveBeenCalled();
    expect(h.writeSnapshot).toHaveBeenCalledTimes(1);
    expect(h.writeSnapshot.mock.calls[0]?.[1]).toEqual({});
    const written = h.writeSnapshot.mock.calls[0]?.[0];
    expect(written?.events[0]).toMatchObject({
      id: "vf-12345",
      description: "",
      source: "visit-frederick",
    });
    expect(written?.events[0]).not.toHaveProperty("hero_image");
  });

  it("never blesses a valid-but-empty first snapshot as healthy", async () => {
    const h = harness();
    h.fetchNative.mockResolvedValue({ state: "ok", xml: EMPTY_RSS });

    const result = await refreshVisitFrederickSnapshot(h.dependencies);

    expect(result).toMatchObject({
      ok: false,
      skipped: false,
      updated: true,
      via: null,
      events: 0,
      status: "failed",
      reason:
        "The valid feed was unexpectedly empty; the prior snapshot was kept.",
    });
    expect(h.reserveUsage).not.toHaveBeenCalled();
    expect(h.fetchFirecrawl).not.toHaveBeenCalled();
    expect(h.writeSnapshot).toHaveBeenCalledOnce();
    expect(h.writeSnapshot).toHaveBeenCalledWith(
      {
        version: 1,
        sourceUrl: VISIT_FREDERICK_FEED_URL,
        lastAttemptAt: NOW.toISOString(),
        sourceFetchedAt: null,
        lastAttemptStatus: "failed",
        events: [],
      },
      {},
    );
  });

  it("lets a recent durable attempt own the two-hour interval", async () => {
    const h = harness();
    setPrevious(
      h,
      previousSnapshot({ lastAttemptAt: "2026-07-31T13:30:00.000Z" }),
    );

    const result = await refreshVisitFrederickSnapshot(h.dependencies);

    expect(result).toMatchObject({
      ok: true,
      skipped: true,
      updated: false,
      via: "native",
    });
    expect(h.fetchNative).not.toHaveBeenCalled();
    expect(h.reserveInterval).not.toHaveBeenCalled();
    expect(h.reserveUsage).not.toHaveBeenCalled();
    expect(h.fetchFirecrawl).not.toHaveBeenCalled();
    expect(h.writeSnapshot).not.toHaveBeenCalled();
  });

  it("reserves one of the hard 12 daily calls before a single recovery scrape", async () => {
    const h = harness();
    setPrevious(h);
    h.fetchNative.mockResolvedValue({
      state: "recoverable",
      reason: "HTTP 403",
    });
    h.reserveUsage.mockResolvedValue({ reserved: true, count: 7 });

    const result = await refreshVisitFrederickSnapshot(h.dependencies);

    expect(VISIT_FREDERICK_FIRECRAWL_DAILY_LIMIT).toBe(12);
    expect(h.reserveUsage).toHaveBeenCalledOnce();
    expect(h.reserveUsage).toHaveBeenCalledWith(
      "firecrawl_visit_frederick",
      12,
    );
    expect(h.writeSnapshot).toHaveBeenCalledTimes(2);
    expect(h.writeSnapshot.mock.calls[0]?.[0]).toMatchObject({
      lastAttemptStatus: "failed",
      events: previousSnapshot().events,
    });
    expect(h.fetchFirecrawl).toHaveBeenCalledOnce();
    expect(h.fetchFirecrawl).toHaveBeenCalledWith(
      VISIT_FREDERICK_FEED_URL,
      {
        outputFormat: "rawHtml",
        onlyMainContent: false,
        maxAgeMs: 0,
        storeInCache: false,
        timeoutMs: 4_500,
        providerTimeoutMs: 3_500,
        proxy: "basic",
        requireReportedFinalUrl: true,
        maxResponseBytes: 1_280 * 1_024,
      },
    );
    expect(result).toMatchObject({
      ok: true,
      via: "firecrawl",
      events: 1,
      status: "ok-firecrawl",
      budget: { limit: 12, reserved: true, count: 7 },
    });
    const finalWrite = h.writeSnapshot.mock.calls[1]?.[0];
    expect(h.writeSnapshot.mock.calls[0]?.[1]).toEqual({
      ifMatch: "etag-previous",
    });
    expect(h.writeSnapshot.mock.calls[1]?.[1]).toEqual({
      ifMatch: "etag-1",
    });
    expect(finalWrite?.events[0]?.description).toBe("");
    expect(finalWrite?.events[0]).not.toHaveProperty("hero_image");
  });

  it("fails closed at the daily limit and never calls Firecrawl", async () => {
    const h = harness();
    h.fetchNative.mockResolvedValue({
      state: "recoverable",
      reason: "HTTP 429",
    });
    h.reserveUsage.mockResolvedValue({ reserved: false, count: 12 });

    const result = await refreshVisitFrederickSnapshot(h.dependencies);

    expect(result).toMatchObject({
      ok: false,
      via: null,
      status: "failed",
      reason: "The daily Firecrawl recovery limit has been reached.",
      budget: { limit: 12, reserved: false, count: 12 },
    });
    expect(h.fetchFirecrawl).not.toHaveBeenCalled();
    expect(h.writeSnapshot).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["not-found" as const, "HTTP 404", "not-found" as const],
    ["rejected" as const, "HTTP 401", "failed" as const],
  ])(
    "records a native %s result without reserving paid recovery",
    async (state, reason, expectedStatus) => {
      const h = harness();
      setPrevious(h);
      h.fetchNative.mockResolvedValue({ state, reason });

      const result = await refreshVisitFrederickSnapshot(h.dependencies);

      expect(result.status).toBe(expectedStatus);
      expect(result.events).toBe(1);
      expect(h.reserveUsage).not.toHaveBeenCalled();
      expect(h.fetchFirecrawl).not.toHaveBeenCalled();
      expect(h.writeSnapshot).toHaveBeenCalledOnce();
    },
  );

  it.each([
    [false, true],
    [true, false],
  ])(
    "does not reserve or scrape when recovery configuration is incomplete (%s/%s)",
    async (firecrawlEnabled, firecrawlKeyPresent) => {
      const h = harness();
      h.fetchNative.mockResolvedValue({
        state: "recoverable",
        reason: "HTTP 503",
      });
      h.dependencies.firecrawlEnabled = firecrawlEnabled;
      h.dependencies.firecrawlKeyPresent = firecrawlKeyPresent;

      const result = await refreshVisitFrederickSnapshot(h.dependencies);

      expect(result.reason).toContain("scheduled recovery is not configured");
      expect(h.reserveUsage).not.toHaveBeenCalled();
      expect(h.fetchFirecrawl).not.toHaveBeenCalled();
    },
  );

  it("stops before the paid call when reservation state cannot be stored", async () => {
    const h = harness();
    h.fetchNative.mockResolvedValue({
      state: "recoverable",
      reason: "the publisher could not be reached",
    });
    h.writeSnapshot.mockResolvedValue({
      stored: false,
      reason: "Blob unavailable",
    });

    const result = await refreshVisitFrederickSnapshot(h.dependencies);

    expect(result).toMatchObject({
      ok: false,
      updated: false,
      reason: "Blob unavailable",
      budget: { reserved: true, count: 1 },
    });
    expect(h.fetchFirecrawl).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed RSS", firecrawlSnapshot("<html>not RSS</html>")],
    [
      "wrong final URL",
      firecrawlSnapshot(EVENT_RSS, {
        finalUrl: "https://example.com/event/rss/",
      }),
    ],
    [
      "wrong media type",
      firecrawlSnapshot(EVENT_RSS, {
        metadata: { statusCode: 200, contentType: "text/html" },
      }),
    ],
    [
      "non-success source status",
      firecrawlSnapshot(EVENT_RSS, {
        metadata: {
          statusCode: 404,
          contentType: "application/rss+xml",
        },
      }),
    ],
    [
      "oversized RSS",
      firecrawlSnapshot(
        `<?xml version="1.0"?><rss><channel>${"x".repeat(513 * 1_024)}</channel></rss>`,
      ),
    ],
  ])("rejects a recovered snapshot with %s", async (_label, recovered) => {
    const h = harness();
    h.fetchNative.mockResolvedValue({
      state: "recoverable",
      reason: "HTTP 403",
    });
    h.fetchFirecrawl.mockResolvedValue(recovered);

    const result = await refreshVisitFrederickSnapshot(h.dependencies);

    expect(result).toMatchObject({
      ok: false,
      updated: true,
      via: null,
      status: "failed",
      reason: "Firecrawl returned an invalid publisher snapshot.",
    });
    expect(h.writeSnapshot).toHaveBeenCalledTimes(1);
  });

  it("keeps the reservation failure snapshot when the provider call throws", async () => {
    const h = harness();
    h.fetchNative.mockResolvedValue({
      state: "recoverable",
      reason: "HTTP 503",
    });
    h.fetchFirecrawl.mockRejectedValue(new Error("provider timeout"));

    const result = await refreshVisitFrederickSnapshot(h.dependencies);

    expect(result).toMatchObject({
      ok: false,
      updated: true,
      reason: "The scheduled Firecrawl recovery failed.",
    });
    expect(h.writeSnapshot).toHaveBeenCalledTimes(1);
  });

  it("preserves last-good facts when a recovered feed suddenly becomes empty", async () => {
    const h = harness();
    const previous = previousSnapshot();
    setPrevious(h, previous);
    h.fetchNative.mockResolvedValue({
      state: "recoverable",
      reason: "HTTP 403",
    });
    h.fetchFirecrawl.mockResolvedValue(firecrawlSnapshot(EMPTY_RSS));

    const result = await refreshVisitFrederickSnapshot(h.dependencies);

    expect(result).toMatchObject({
      ok: false,
      via: null,
      events: 1,
      status: "failed",
    });
    expect(h.writeSnapshot.mock.calls[1]?.[0]).toMatchObject({
      lastAttemptStatus: "failed",
      sourceFetchedAt: previous.sourceFetchedAt,
      events: previous.events,
    });
    expect(h.writeSnapshot.mock.calls[1]?.[1]).toEqual({
      ifMatch: "etag-1",
    });
  });

  it("stops at the approval gate before storage, network, or database work", async () => {
    const h = harness();
    h.dependencies.reuseApproved = false;

    const result = await refreshVisitFrederickSnapshot(h.dependencies);

    expect(result).toMatchObject({ ok: true, skipped: true, updated: false });
    expect(h.readSnapshot).not.toHaveBeenCalled();
    expect(h.reserveInterval).not.toHaveBeenCalled();
    expect(h.fetchNative).not.toHaveBeenCalled();
    expect(h.reserveUsage).not.toHaveBeenCalled();
    expect(h.fetchFirecrawl).not.toHaveBeenCalled();
    expect(h.writeSnapshot).not.toHaveBeenCalled();
  });

  it("stops before fetch or write when the durable snapshot cannot be read", async () => {
    const h = harness();
    h.readSnapshot.mockResolvedValue({
      state: "unavailable",
      reason: "Snapshot storage was unavailable",
    });

    const result = await refreshVisitFrederickSnapshot(h.dependencies);

    expect(result).toMatchObject({
      ok: false,
      updated: false,
      reason: "Snapshot storage was unavailable",
    });
    expect(h.reserveInterval).not.toHaveBeenCalled();
    expect(h.fetchNative).not.toHaveBeenCalled();
    expect(h.writeSnapshot).not.toHaveBeenCalled();
  });

  it.each([
    [null, false, false, "The refresh interval lease could not be reserved."],
    [{ acquired: false }, true, false, "Another refresh already owns this interval."],
  ])("fails closed when the interval lease is unavailable or already owned", async (lease, skipped, ok, reason) => {
    const h = harness();
    h.reserveInterval.mockResolvedValue(lease);

    const result = await refreshVisitFrederickSnapshot(h.dependencies);

    expect(result).toMatchObject({ ok, skipped, updated: false, reason });
    expect(h.fetchNative).not.toHaveBeenCalled();
    expect(h.reserveUsage).not.toHaveBeenCalled();
    expect(h.writeSnapshot).not.toHaveBeenCalled();
  });

  it("uses the prior ETag for native success and failure writes", async () => {
    const success = harness();
    setPrevious(success);
    await refreshVisitFrederickSnapshot(success.dependencies);
    expect(success.writeSnapshot.mock.calls[0]?.[1]).toEqual({
      ifMatch: "etag-previous",
    });

    const failure = harness();
    setPrevious(failure);
    failure.fetchNative.mockResolvedValue({ state: "rejected", reason: "HTTP 401" });
    await refreshVisitFrederickSnapshot(failure.dependencies);
    expect(failure.writeSnapshot.mock.calls[0]?.[1]).toEqual({
      ifMatch: "etag-previous",
    });
  });

  it("requires two consecutive destructive 404s before clearing prior events", async () => {
    const first = harness();
    setPrevious(first);
    first.fetchNative.mockResolvedValue({ state: "not-found", reason: "HTTP 404" });
    await refreshVisitFrederickSnapshot(first.dependencies);
    expect(first.writeSnapshot.mock.calls[0]?.[0]?.events).toHaveLength(1);
    expect(first.writeSnapshot.mock.calls[0]?.[0]?.lastAttemptStatus).toBe("not-found");

    const confirmed = harness();
    setPrevious(
      confirmed,
      previousSnapshot({ lastAttemptStatus: "not-found" }),
    );
    confirmed.fetchNative.mockResolvedValue({ state: "not-found", reason: "HTTP 404" });
    const result = await refreshVisitFrederickSnapshot(confirmed.dependencies);
    expect(result.events).toBe(0);
    expect(confirmed.writeSnapshot.mock.calls[0]?.[0]?.events).toEqual([]);
    expect(confirmed.writeSnapshot.mock.calls[0]?.[1]).toEqual({
      ifMatch: "etag-previous",
    });
  });

  it("keeps a large last-good snapshot when a new feed collapses sharply", async () => {
    const h = harness();
    const priorEvents = Array.from({ length: 10 }, (_, index) => ({
      ...factualEvent(),
      id: `vf-${10000 + index}`,
      title: `Stored Event ${index}`,
      url: `https://www.visitfrederick.org/event/stored-event-${index}/${10000 + index}/`,
    }));
    setPrevious(h, previousSnapshot({ events: priorEvents }));

    const result = await refreshVisitFrederickSnapshot(h.dependencies);

    expect(result).toMatchObject({ ok: false, status: "failed", events: 10 });
    expect(h.writeSnapshot.mock.calls[0]?.[0]?.events).toEqual(priorEvents);
  });
});
