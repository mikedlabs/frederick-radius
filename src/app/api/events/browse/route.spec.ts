import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadEventArchiveSnapshot: vi.fn(),
  isSameOriginRequest: vi.fn(() => true),
  isRateLimited: vi.fn(async () => false),
}));

vi.mock("@/lib/loaders/todayEventSnapshot", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/loaders/todayEventSnapshot")
  >();
  return {
    ...actual,
    loadEventArchiveSnapshot: mocks.loadEventArchiveSnapshot,
  };
});

vi.mock("@/lib/origin-check", () => ({
  isSameOriginRequest: mocks.isSameOriginRequest,
  isRateLimited: mocks.isRateLimited,
}));

import { dynamic, GET } from "./route";

const request = (refresh = false) =>
  new Request(
    `https://frederickradius.app/api/events/browse${refresh ? "?refresh=1" : ""}`,
  );

describe("GET /api/events/browse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.loadEventArchiveSnapshot.mockResolvedValue({
      publicEvents: [],
      sourceHealth: { degraded: false, unavailable: [] },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("always reads the archive at runtime and shares healthy snapshots briefly", async () => {
    const response = await GET(request());

    expect(dynamic).toBe("force-dynamic");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=900",
    );
  });

  it("never stores a degraded archive fallback", async () => {
    mocks.loadEventArchiveSnapshot.mockResolvedValue({
      publicEvents: [],
      sourceHealth: {
        degraded: true,
        unavailable: ["permission denied for table event_canonical_records"],
        issues: [{
          code: "event_archive_timeout",
          message: "permission denied for table event_canonical_records",
        }],
      },
    });

    const response = await GET(request());

    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(await response.json()).toMatchObject({
      sourceHealth: {
        degraded: true,
        unavailable: ["The event schedule is taking longer than expected to load."],
        issues: [{
          code: "event_archive_timeout",
          message: "The event schedule is taking longer than expected to load.",
        }],
      },
    });
  });

  it("returns a safe fail-soft board when the loader rejects unexpectedly", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.loadEventArchiveSnapshot.mockRejectedValue(
      new Error("postgres://user:secret@example.test/db"),
    );

    const response = await GET(request());
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(text).not.toContain("secret");
    expect(JSON.parse(text).sourceHealth).toMatchObject({
      degraded: true,
      issues: [{ code: "event_archive_unavailable" }],
      unavailable: ["The event schedule is temporarily unavailable."],
    });
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls[0]?.[1])).not.toContain("secret");
  });

  it("lets Check again bypass a stale shared answer without caching the recovery read", async () => {
    const response = await GET(request(true));

    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(mocks.isSameOriginRequest).toHaveBeenCalledOnce();
    expect(mocks.isRateLimited).toHaveBeenCalledWith(
      expect.any(Request),
      "events-explicit-refresh",
      6,
      60,
    );
  });

  it("blocks a foreign explicit refresh before archive work", async () => {
    mocks.isSameOriginRequest.mockReturnValue(false);

    const response = await GET(request(true));

    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(await response.json()).toEqual({ error: "forbidden-origin" });
    expect(mocks.isRateLimited).not.toHaveBeenCalled();
    expect(mocks.loadEventArchiveSnapshot).not.toHaveBeenCalled();
  });

  it("rate-limits repeated explicit refreshes before archive work", async () => {
    mocks.isRateLimited.mockResolvedValue(true);

    const response = await GET(request(true));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toEqual({ error: "rate-limited" });
    expect(mocks.loadEventArchiveSnapshot).not.toHaveBeenCalled();
  });
});
