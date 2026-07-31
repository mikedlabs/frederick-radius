import { describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import {
  prepareEventArchiveRows,
  syncEventArchiveBatchWithWriter,
  type EventArchiveBatchWriter,
} from "./event-archive-batch";

function event(
  slug: string,
  sourceId: string,
  verifiedAt = "2026-07-29T12:00:00.000Z",
): EventWithMeta {
  return {
    slug,
    title: slug,
    description: "",
    starts_at: "2026-08-01T22:00:00.000Z",
    ends_at: "2026-08-02T00:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Test venue",
    address: "Frederick, MD",
    geom: { lng: -77.4105, lat: 39.4143 },
    municipality: "frederick",
    category: "community",
    audience: [],
    is_free: true,
    source: "celebrate",
    is_verified: false,
    source_id: sourceId,
    source_url: "https://example.com/event",
    license: "test",
    first_seen_at: verifiedAt,
    last_verified_at: verifiedAt,
    confidence: "partner",
    geo_confidence: "exact_address",
    category_name: "Community",
    municipality_name: "Frederick",
  };
}

function writer(
  overrides: Partial<EventArchiveBatchWriter> = {},
): EventArchiveBatchWriter {
  return {
    upsert: vi.fn(async (rows) => ({
      upserted: rows.length,
      ignoredLifecycleOnly: 0,
    })),
    tombstoneMissing: vi.fn(async () => 0),
    ...overrides,
  };
}

function lifecycleWriter() {
  const records = new Map<
    string,
    ReturnType<typeof prepareEventArchiveRows>["rows"][number]
  >();
  const sink = writer({
    upsert: vi.fn(async (rows) => {
      let upserted = 0;
      let ignoredLifecycleOnly = 0;
      for (const row of rows) {
        const key = `${row.source}\u0000${row.source_uid}`;
        if (records.has(key) || row.event_status === "scheduled") {
          records.set(key, row);
          upserted++;
        } else {
          ignoredLifecycleOnly++;
        }
      }
      return { upserted, ignoredLifecycleOnly };
    }),
  });
  return { records, sink };
}

describe("event archive batch", () => {
  it("keeps publisher identity stable when a title edit changes the slug", () => {
    const old = prepareEventArchiveRows([
      event(
        "first-saturday-art-walk-2026-08-01",
        "publisher-uid-44",
        "2026-07-28T12:00:00.000Z",
      ),
    ]).rows[0];
    const renamed = prepareEventArchiveRows([
      event(
        "first-saturday-downtown-2026-08-01",
        "publisher-uid-44",
        "2026-07-29T12:00:00.000Z",
      ),
    ]).rows[0];

    expect([old.source, old.source_uid]).toEqual([
      renamed.source,
      renamed.source_uid,
    ]);
    expect(old.slug).not.toBe(renamed.slug);
  });

  it("never tombstones when the warm path cannot prove a source succeeded", async () => {
    const sink = writer();
    const result = await syncEventArchiveBatchWithWriter(
      [event("alive-at-five-2026-08-06", "alive-0806")],
      { successfulSources: [] },
      sink,
    );

    expect(result.upserted).toBe(1);
    expect(result.ignoredLifecycleOnly).toBe(0);
    expect(result.complete).toBe(true);
    expect(result.tombstonesEnabled).toBe(false);
    expect(sink.tombstoneMissing).not.toHaveBeenCalled();
  });

  it("does not treat a source name alone as complete removal evidence", async () => {
    const sink = writer();
    const result = await syncEventArchiveBatchWithWriter(
      [event("alive-at-five-2026-08-06", "alive-0806")],
      { successfulSources: ["celebrate"] },
      sink,
    );

    expect(result.complete).toBe(true);
    expect(result.tombstonesEnabled).toBe(false);
    expect(sink.tombstoneMissing).not.toHaveBeenCalled();
  });

  it("only enables removal checks after a complete sync with explicit source proof", async () => {
    const sink = writer({
      tombstoneMissing: vi.fn(async () => 2),
    });
    const current = event(
      "first-saturday-art-walk-2026-08-01",
      "publisher-uid-44",
    );
    const result = await syncEventArchiveBatchWithWriter(
      [current],
      {
        successfulSources: ["celebrate", "celebrate", "  "],
        seenSourceIdentities: [
          { source: "celebrate", source_uid: "publisher-uid-44" },
          { source: "celebrate", source_uid: "publisher-uid-44" },
          { source: " ", source_uid: "ignored" },
        ],
        graceMs: 1,
      },
      sink,
    );

    expect(result.complete).toBe(true);
    expect(result.tombstonesEnabled).toBe(true);
    expect(result.tombstoned).toBe(2);
    expect(sink.tombstoneMissing).toHaveBeenCalledWith(
      [{ source: "celebrate", source_uid: "publisher-uid-44" }],
      ["celebrate"],
      expect.objectContaining({
        graceMs: 24 * 60 * 60_000,
      }),
    );
  });

  it("uses the complete source inventory rather than the filtered public cards for removal checks", async () => {
    const sink = writer();
    const result = await syncEventArchiveBatchWithWriter(
      [event("public-winner", "winner-1")],
      {
        successfulSources: ["celebrate"],
        seenSourceIdentities: [
          { source: "celebrate", source_uid: "winner-1" },
          // This publisher row was deduplicated out of the public board. It
          // must still count as seen so its durable link is not tombstoned.
          { source: "celebrate", source_uid: "duplicate-still-upstream" },
        ],
      },
      sink,
    );

    expect(result.complete).toBe(true);
    expect(result.tombstonesEnabled).toBe(true);
    expect(sink.tombstoneMissing).toHaveBeenCalledWith(
      [
        { source: "celebrate", source_uid: "winner-1" },
        { source: "celebrate", source_uid: "duplicate-still-upstream" },
      ],
      ["celebrate"],
      expect.any(Object),
    );
  });

  it("bounds transaction size, total rows, and wall-clock work", async () => {
    const events = Array.from({ length: 310 }, (_, index) =>
      event(`event-${index}`, `uid-${index}`),
    );
    let now = 0;
    const sink = writer({
      upsert: vi.fn(async (rows) => {
        now += 60;
        return {
          upserted: rows.length,
          ignoredLifecycleOnly: 0,
        };
      }),
    });
    const result = await syncEventArchiveBatchWithWriter(
      events,
      {
        batchSize: 50,
        maxEvents: 250,
        deadlineMs: 100,
        successfulSources: ["celebrate"],
        clock: () => now,
      },
      sink,
    );

    expect(
      vi.mocked(sink.upsert).mock.calls.every(
        ([rows]) => rows.length <= 50,
      ),
    ).toBe(true);
    expect(result.accepted).toBe(250);
    expect(result.truncated).toBe(true);
    expect(result.timedOut).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.batches).toBe(1);
    expect(result.tombstonesEnabled).toBe(false);
    expect(sink.tombstoneMissing).not.toHaveBeenCalled();
  });

  it("keeps the soonest events when an upstream season exceeds the hard cap", () => {
    const far = event("far-event", "far");
    far.starts_at = "2026-12-01T22:00:00.000Z";
    far.ends_at = "2026-12-02T00:00:00.000Z";
    const soon = event("soon-event", "soon");
    soon.starts_at = "2026-08-01T22:00:00.000Z";
    soon.ends_at = "2026-08-02T00:00:00.000Z";

    const prepared = prepareEventArchiveRows([far, soon], 1);

    expect(prepared.truncated).toBe(true);
    expect(prepared.rows.map((row) => row.slug)).toEqual(["soon-event"]);
  });

  it("updates the existing canonical snapshot when a scheduled event is cancelled", async () => {
    const { records, sink } = lifecycleWriter();
    const scheduled = event(
      "alive-at-five-2026-08-06",
      "alive-0806",
      "2026-07-29T12:00:00.000Z",
    );
    const cancelled = {
      ...scheduled,
      status: "cancelled" as const,
      last_verified_at: "2026-07-30T12:00:00.000Z",
    };

    const first = await syncEventArchiveBatchWithWriter(
      [scheduled],
      {},
      sink,
    );
    const changed = await syncEventArchiveBatchWithWriter(
      [cancelled],
      {},
      sink,
    );

    expect(first).toMatchObject({
      complete: true,
      upserted: 1,
      ignoredLifecycleOnly: 0,
    });
    expect(changed).toMatchObject({
      complete: true,
      upserted: 1,
      ignoredLifecycleOnly: 0,
    });
    expect(records.get("celebrate\u0000alive-0806")).toMatchObject({
      slug: scheduled.slug,
      event_status: "cancelled",
      snapshot: expect.objectContaining({ status: "cancelled" }),
    });
  });

  it("updates the existing canonical snapshot when a scheduled event is postponed", async () => {
    const { records, sink } = lifecycleWriter();
    const scheduled = event(
      "summer-concert-2026-08-14",
      "concert-0814",
      "2026-07-29T12:00:00.000Z",
    );
    const postponed = {
      ...scheduled,
      status: "postponed" as const,
      last_verified_at: "2026-07-30T12:00:00.000Z",
    };

    await syncEventArchiveBatchWithWriter([scheduled], {}, sink);
    const changed = await syncEventArchiveBatchWithWriter(
      [postponed],
      {},
      sink,
    );

    expect(changed).toMatchObject({
      complete: true,
      upserted: 1,
      ignoredLifecycleOnly: 0,
    });
    expect(records.get("celebrate\u0000concert-0814")).toMatchObject({
      slug: scheduled.slug,
      event_status: "postponed",
      snapshot: expect.objectContaining({ status: "postponed" }),
    });
  });

  it.each(["cancelled", "postponed"] as const)(
    "processes but does not publish a brand-new %s-only source row",
    async (status) => {
      const { records, sink } = lifecycleWriter();
      const lifecycleOnly = {
        ...event(`unpublished-${status}-event`, `orphan-${status}`),
        status,
      };

      const result = await syncEventArchiveBatchWithWriter(
        [lifecycleOnly],
        {},
        sink,
      );

      expect(result).toMatchObject({
        complete: true,
        accepted: 1,
        upserted: 0,
        ignoredLifecycleOnly: 1,
      });
      expect(records.size).toBe(0);
    },
  );
});
