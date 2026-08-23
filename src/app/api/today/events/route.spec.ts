import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadTodayEventSnapshot: vi.fn(),
  isSameOriginRequest: vi.fn(() => true),
  isRateLimited: vi.fn(async () => false),
}));

vi.mock("@/lib/loaders/todayEventSnapshot", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/loaders/todayEventSnapshot")
  >();
  return {
    ...actual,
    loadTodayEventSnapshot: mocks.loadTodayEventSnapshot,
  };
});

vi.mock("@/lib/origin-check", () => ({
  isSameOriginRequest: mocks.isSameOriginRequest,
  isRateLimited: mocks.isRateLimited,
}));

import { dynamic, GET } from "./route";

const request = (refresh = false) =>
  new Request(
    `https://frederickradius.app/api/today/events${refresh ? "?refresh=1" : ""}`,
  );

describe("GET /api/today/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.loadTodayEventSnapshot.mockResolvedValue({
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
    mocks.loadTodayEventSnapshot.mockResolvedValue({
      publicEvents: [],
      sourceHealth: {
        degraded: true,
        unavailable: ["read rejected: postgres://user:secret@example.test/db"],
        issues: [{
          code: "event_archive_timeout",
          message: "read rejected: postgres://user:secret@example.test/db",
        }],
      },
    });

    const response = await GET(request());

    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(await response.json()).toMatchObject({
      partial: true,
      unavailable: ["The event schedule is taking longer than expected to load."],
      issues: [{
        code: "event_archive_timeout",
        message: "The event schedule is taking longer than expected to load.",
      }],
    });
  });

  it("keeps an unexpected loader error out of the public response", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.loadTodayEventSnapshot.mockRejectedValue(
      new Error("postgres://user:secret@example.test/db"),
    );

    const response = await GET(request());
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(text).not.toContain("secret");
    expect(JSON.parse(text)).toMatchObject({
      partial: true,
      issues: [{ code: "event_archive_unavailable" }],
      unavailable: ["The event schedule is temporarily unavailable."],
    });
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls[0]?.[1])).not.toContain("secret");
  });

  it("keeps an explicit recovery read out of every shared cache", async () => {
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
    expect(mocks.loadTodayEventSnapshot).not.toHaveBeenCalled();
  });

  it("rate-limits repeated explicit refreshes before archive work", async () => {
    mocks.isRateLimited.mockResolvedValue(true);

    const response = await GET(request(true));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toEqual({ error: "rate-limited" });
    expect(mocks.loadTodayEventSnapshot).not.toHaveBeenCalled();
  });
});
