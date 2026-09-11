import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blobMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  BlobPreconditionFailedError: class BlobPreconditionFailedError extends Error {},
}));

vi.mock("@vercel/blob", () => blobMocks);

import {
  isExactVisitFrederickFeedUrl,
  isVisitFrederickSnapshot,
  MAX_VISIT_FREDERICK_EVENTS,
  MAX_VISIT_FREDERICK_SNAPSHOT_BYTES,
  readVisitFrederickSnapshotState,
  readStoredVisitFrederickSnapshot,
  VISIT_FREDERICK_FEED_URL,
  VISIT_FREDERICK_SNAPSHOT_BLOB,
  VISIT_FREDERICK_SNAPSHOT_FRESH_MS,
  VISIT_FREDERICK_SNAPSHOT_MAX_STALE_MS,
  visitFrederickSnapshotAgeMs,
  writeVisitFrederickSnapshot,
  type VisitFrederickSnapshot,
} from "@/lib/integrations/visitfrederick-snapshot";

const FETCHED_AT = "2026-07-31T12:00:00.000Z";
const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;

function event(verifiedAt = FETCHED_AT) {
  return {
    id: "vf-12345",
    title: "A factual event",
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
    url: "https://www.visitfrederick.org/event/a-factual-event/12345/",
    is_free: true,
    status: "scheduled" as const,
    last_verified_at: verifiedAt,
  };
}

function snapshot(
  overrides: Partial<VisitFrederickSnapshot> = {},
): VisitFrederickSnapshot {
  return {
    version: 1,
    sourceUrl: VISIT_FREDERICK_FEED_URL,
    lastAttemptAt: "2026-07-31T12:05:00.000Z",
    sourceFetchedAt: FETCHED_AT,
    lastAttemptStatus: "ok-native",
    events: [event()],
    ...overrides,
  };
}

function jsonStream(value: unknown): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function blobRead(value: unknown, declaredSize?: number) {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  return {
    statusCode: 200,
    stream: jsonStream(value),
    blob: { size: declaredSize ?? encoded.byteLength, etag: "etag-v1" },
  };
}

describe("Visit Frederick durable snapshot contract", () => {
  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_test";
    vi.clearAllMocks();
    blobMocks.put.mockResolvedValue({
      url: "https://blob.example/events/visit-frederick-snapshot-v1.json",
      etag: "etag-v2",
    });
  });

  afterEach(() => {
    if (originalBlobToken === undefined) {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    } else {
      process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;
    }
    vi.useRealTimers();
  });

  it("accepts only bounded factual events tied to the source timestamp", () => {
    expect(isVisitFrederickSnapshot(snapshot())).toBe(true);
    expect(
      isVisitFrederickSnapshot(
        snapshot({
          events: [{ ...event(), description: "Publisher prose" }],
        }),
      ),
    ).toBe(false);
    expect(
      isVisitFrederickSnapshot(
        snapshot({
          events: [
            {
              ...event(),
              hero_image: "https://assets.simpleviewinc.com/image.jpg",
            },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      isVisitFrederickSnapshot(
        snapshot({ events: [event("2026-07-31T11:59:59.000Z")] }),
      ),
    ).toBe(false);
    expect(
      isVisitFrederickSnapshot(
        snapshot({
          events: Array.from(
            { length: MAX_VISIT_FREDERICK_EVENTS + 1 },
            () => event(),
          ),
        }),
      ),
    ).toBe(false);
  });

  it("allows only the reviewed HTTPS feed URL without credentials, query, or fragment", () => {
    expect(isExactVisitFrederickFeedUrl(VISIT_FREDERICK_FEED_URL)).toBe(true);
    expect(isExactVisitFrederickFeedUrl("https://visitfrederick.org/event/rss")).toBe(true);
    for (const candidate of [
      "http://www.visitfrederick.org/event/rss/",
      "https://www.visitfrederick.org/event/rss/?all=1",
      "https://www.visitfrederick.org/event/rss/#feed",
      "https://user:pass@www.visitfrederick.org/event/rss/",
      "https://example.com/event/rss/",
      "https://www.visitfrederick.org/events/rss/",
    ]) {
      expect(isExactVisitFrederickFeedUrl(candidate), candidate).toBe(false);
    }
  });

  it("computes fresh, stale, and missing-source ages without negative values", () => {
    const current = snapshot();
    expect(
      visitFrederickSnapshotAgeMs(
        current,
        new Date(Date.parse(FETCHED_AT) + VISIT_FREDERICK_SNAPSHOT_FRESH_MS),
      ),
    ).toBe(VISIT_FREDERICK_SNAPSHOT_FRESH_MS);
    expect(
      visitFrederickSnapshotAgeMs(
        current,
        new Date(Date.parse(FETCHED_AT) + VISIT_FREDERICK_SNAPSHOT_MAX_STALE_MS),
      ),
    ).toBe(VISIT_FREDERICK_SNAPSHOT_MAX_STALE_MS);
    expect(
      visitFrederickSnapshotAgeMs(current, new Date("2026-07-31T11:00:00Z")),
    ).toBe(0);
    expect(
      visitFrederickSnapshotAgeMs(
        snapshot({ sourceFetchedAt: null, events: [] }),
      ),
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it("reads the exact bounded Blob and selects cache behavior explicitly", async () => {
    blobMocks.get
      .mockResolvedValueOnce(blobRead(snapshot()))
      .mockResolvedValueOnce(blobRead(snapshot()));

    await expect(
      readStoredVisitFrederickSnapshot({ cacheMode: "cache-first" }),
    ).resolves.toEqual(snapshot());
    await expect(
      readStoredVisitFrederickSnapshot({ cacheMode: "origin-fresh" }),
    ).resolves.toEqual(snapshot());

    expect(blobMocks.get.mock.calls[0]?.[0]).toBe(
      VISIT_FREDERICK_SNAPSHOT_BLOB,
    );
    expect(blobMocks.get.mock.calls[0]?.[1]).toMatchObject({
      access: "public",
      useCache: true,
      abortSignal: expect.any(AbortSignal),
    });
    expect(blobMocks.get.mock.calls[1]?.[1]).toMatchObject({
      access: "public",
      useCache: false,
      abortSignal: expect.any(AbortSignal),
    });
  });

  it("distinguishes a confirmed missing object from unavailable storage", async () => {
    blobMocks.get
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("storage timeout"));

    await expect(readVisitFrederickSnapshotState()).resolves.toEqual({
      state: "missing",
    });
    await expect(readVisitFrederickSnapshotState()).resolves.toEqual({
      state: "unavailable",
      reason: "Snapshot storage was unavailable",
    });
  });

  it("rejects declared and streamed Blob bodies above the hard byte limit", async () => {
    const cancel = vi.fn(async () => undefined);
    blobMocks.get
      .mockResolvedValueOnce({
        statusCode: 200,
        stream: { cancel },
        blob: {
          size: MAX_VISIT_FREDERICK_SNAPSHOT_BYTES + 1,
          etag: "etag-large",
        },
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        stream: jsonStream("x".repeat(MAX_VISIT_FREDERICK_SNAPSHOT_BYTES + 1)),
        blob: { size: 1, etag: "etag-streamed" },
      });

    await expect(readStoredVisitFrederickSnapshot()).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
    await expect(readStoredVisitFrederickSnapshot()).resolves.toBeNull();
  });

  it("writes one deterministic overwrite and rejects invalid or oversized snapshots", async () => {
    const valid = snapshot();
    await expect(writeVisitFrederickSnapshot(valid)).resolves.toEqual({
      stored: true,
      url: "https://blob.example/events/visit-frederick-snapshot-v1.json",
      etag: "etag-v2",
    });
    expect(blobMocks.put).toHaveBeenCalledWith(
      VISIT_FREDERICK_SNAPSHOT_BLOB,
      JSON.stringify(valid),
      expect.objectContaining({
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: false,
        abortSignal: expect.any(AbortSignal),
        cacheControlMaxAge: 60,
        contentType: "application/json",
        maximumSizeInBytes: MAX_VISIT_FREDERICK_SNAPSHOT_BYTES,
      }),
    );

    blobMocks.put.mockClear();
    await expect(
      writeVisitFrederickSnapshot(
        snapshot({ events: [{ ...event(), description: "not factual" }] }),
      ),
    ).resolves.toMatchObject({ stored: false, reason: "Snapshot validation failed" });

    const oversized = snapshot({
      events: [
        {
          ...event(),
          url: `https://www.visitfrederick.org/event/${"x".repeat(MAX_VISIT_FREDERICK_SNAPSHOT_BYTES)}/`,
        },
      ],
    });
    expect(isVisitFrederickSnapshot(oversized)).toBe(true);
    await expect(writeVisitFrederickSnapshot(oversized)).resolves.toMatchObject({
      stored: false,
      reason: "Snapshot exceeded the storage limit",
    });
    expect(blobMocks.put).not.toHaveBeenCalled();
  });

  it("uses ETag preconditions for overwrite and reports a real Blob conflict", async () => {
    const valid = snapshot();
    await expect(
      writeVisitFrederickSnapshot(valid, { ifMatch: "etag-v1" }),
    ).resolves.toMatchObject({ stored: true, etag: "etag-v2" });
    expect(blobMocks.put.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        allowOverwrite: true,
        ifMatch: "etag-v1",
        abortSignal: expect.any(AbortSignal),
        maximumSizeInBytes: MAX_VISIT_FREDERICK_SNAPSHOT_BYTES,
      }),
    );

    blobMocks.put.mockRejectedValueOnce(
      new blobMocks.BlobPreconditionFailedError("etag mismatch"),
    );
    await expect(
      writeVisitFrederickSnapshot(valid, { ifMatch: "stale-etag" }),
    ).resolves.toEqual({
      stored: false,
      conflict: true,
      reason: "A newer snapshot was kept",
    });
  });

  it("never touches Blob when storage is not configured", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;

    await expect(readStoredVisitFrederickSnapshot()).resolves.toBeNull();
    await expect(writeVisitFrederickSnapshot(snapshot())).resolves.toMatchObject({
      stored: false,
      reason: "Blob storage is not configured",
    });
    expect(blobMocks.get).not.toHaveBeenCalled();
    expect(blobMocks.put).not.toHaveBeenCalled();
  });
});
