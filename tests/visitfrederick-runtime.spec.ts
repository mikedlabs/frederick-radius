import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const snapshotMocks = vi.hoisted(() => ({
  readStoredVisitFrederickSnapshot: vi.fn(),
}));

vi.mock("@/lib/integrations/visitfrederick-snapshot", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/integrations/visitfrederick-snapshot")
  >();
  return {
    ...actual,
    readStoredVisitFrederickSnapshot:
      snapshotMocks.readStoredVisitFrederickSnapshot,
  };
});

import { fetchVisitFrederickResult } from "@/lib/integrations/visitfrederick";
import {
  VISIT_FREDERICK_FEED_URL,
  type VisitFrederickSnapshot,
} from "@/lib/integrations/visitfrederick-snapshot";

const NOW = new Date("2026-07-31T16:00:00.000Z");
const originalReuseApproval =
  process.env.VISIT_FREDERICK_FACTS_REUSE_APPROVED;

function snapshot(
  overrides: Partial<VisitFrederickSnapshot> = {},
): VisitFrederickSnapshot {
  const sourceFetchedAt = "2026-07-31T14:00:00.000Z";
  return {
    version: 1,
    sourceUrl: VISIT_FREDERICK_FEED_URL,
    lastAttemptAt: "2026-07-31T14:00:00.000Z",
    sourceFetchedAt,
    lastAttemptStatus: "ok-native",
    events: [
      {
        id: "vf-12345",
        title: "Stored event",
        description: "",
        starts_at: "2026-08-01T16:00:00.000Z",
        ends_at: "2026-08-02T03:59:59.000Z",
        venue_name: "",
        address: "",
        geom: { lng: -77.4105, lat: 39.4143 },
        municipality: "frederick",
        category: "community",
        organizer: "Visit Frederick",
        source: "visit-frederick",
        source_label: "Visit Frederick",
        url: "https://www.visitfrederick.org/event/stored-event/12345/",
        is_free: true,
        status: "scheduled",
        last_verified_at: sourceFetchedAt,
      },
    ],
    ...overrides,
  };
}

describe("Visit Frederick visitor-request runtime", () => {
  beforeEach(() => {
    process.env.VISIT_FREDERICK_FACTS_REUSE_APPROVED = "1";
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    snapshotMocks.readStoredVisitFrederickSnapshot.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("visitor runtime attempted a live network read");
      }),
    );
  });

  afterEach(() => {
    if (originalReuseApproval === undefined) {
      delete process.env.VISIT_FREDERICK_FACTS_REUSE_APPROVED;
    } else {
      process.env.VISIT_FREDERICK_FACTS_REUSE_APPROVED =
        originalReuseApproval;
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not read or serve a stored snapshot while factual reuse is unapproved", async () => {
    process.env.VISIT_FREDERICK_FACTS_REUSE_APPROVED = "0";
    snapshotMocks.readStoredVisitFrederickSnapshot.mockResolvedValue(
      snapshot(),
    );

    await expect(fetchVisitFrederickResult()).resolves.toEqual({
      state: "failed",
      items: [],
    });
    expect(
      snapshotMocks.readStoredVisitFrederickSnapshot,
    ).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves a fresh successful Blob snapshot as healthy", async () => {
    snapshotMocks.readStoredVisitFrederickSnapshot.mockResolvedValue(
      snapshot(),
    );

    await expect(fetchVisitFrederickResult()).resolves.toMatchObject({
      state: "ok",
      items: [{ id: "vf-12345", title: "Stored event" }],
    });
    expect(snapshotMocks.readStoredVisitFrederickSnapshot).toHaveBeenCalledWith({
      cacheMode: "cache-first",
      timeoutMs: 1_500,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["last refresh failed", snapshot({ lastAttemptStatus: "failed" })],
    [
      "last good facts are older than the fresh window",
      snapshot({
        sourceFetchedAt: "2026-07-31T12:00:00.000Z",
        events: [
          {
            ...snapshot().events[0],
            last_verified_at: "2026-07-31T12:00:00.000Z",
          },
        ],
      }),
    ],
  ])("serves retained facts as partial when %s", async (_label, stored) => {
    snapshotMocks.readStoredVisitFrederickSnapshot.mockResolvedValue(stored);

    await expect(fetchVisitFrederickResult()).resolves.toMatchObject({
      state: "partial",
      items: [{ id: "vf-12345" }],
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("drops facts once the maximum stale window has elapsed", async () => {
    const staleAt = "2026-07-30T15:59:59.999Z";
    snapshotMocks.readStoredVisitFrederickSnapshot.mockResolvedValue(
      snapshot({
        sourceFetchedAt: staleAt,
        events: [
          {
            ...snapshot().events[0],
            last_verified_at: staleAt,
          },
        ],
      }),
    );

    await expect(fetchVisitFrederickResult()).resolves.toEqual({
      state: "failed",
      items: [],
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    [
      "terminal publisher removal",
      snapshot({
        lastAttemptStatus: "not-found",
        sourceFetchedAt: null,
        events: [],
      }),
    ],
    [
      "never successfully fetched",
      snapshot({
        sourceFetchedAt: null,
        lastAttemptStatus: "failed",
        events: [],
      }),
    ],
  ])("fails closed for a %s snapshot", async (_label, stored) => {
    snapshotMocks.readStoredVisitFrederickSnapshot.mockResolvedValue(stored);

    await expect(fetchVisitFrederickResult()).resolves.toEqual({
      state: "failed",
      items: [],
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
