import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { EventWithMeta } from "@/lib/loaders/events";

const mocks = vi.hoisted(() => ({
  loadEventArchiveSnapshot: vi.fn(),
  approxLocation: vi.fn(),
  recordSearchMiss: vi.fn(),
}));

vi.mock("@/lib/loaders/todayEventSnapshot", () => ({
  loadEventArchiveSnapshot: mocks.loadEventArchiveSnapshot,
  TODAY_EVENT_SNAPSHOT_TIMEOUT_MS: 650,
}));

vi.mock("@/lib/ip-geo", () => ({
  approxLocation: mocks.approxLocation,
}));

vi.mock("@/lib/telemetry/searchMiss", () => ({
  recordSearchMiss: mocks.recordSearchMiss,
}));

import { GET } from "./route";

function request(query: string, origin = "map") {
  const url = new URL("https://frederickradius.app/api/search");
  url.searchParams.set("q", query);
  url.searchParams.set("origin", origin);
  url.searchParams.set("lat", "39.4143");
  url.searchParams.set("lng", "-77.4109");
  return new NextRequest(url);
}

function liveEvent(): EventWithMeta {
  return {
    slug: "radius-investor-showcase",
    title: "Radius Investor Showcase",
    description: "A live event supplied by the unified event assembly.",
    starts_at: "2026-08-01T23:00:00.000Z",
    ends_at: "2026-08-02T01:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Test Venue",
    address: "1 Market Street, Frederick, MD 21701",
    geom: { lng: -77.4109, lat: 39.4143 },
    municipality: "frederick",
    category: "community",
    audience: [],
    is_free: true,
    source: "manual",
    is_verified: true,
    feature_score: 10,
    municipality_name: "Frederick",
    category_name: "Community",
  } as unknown as EventWithMeta;
}

describe("GET /api/search map fast path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadEventArchiveSnapshot.mockResolvedValue({
      publicEvents: [liveEvent()],
      sourceHealth: { degraded: false, unavailable: [] },
    });
    mocks.approxLocation.mockResolvedValue({
      origin: null,
      status: "unavailable",
    });
  });

  it.each([
    ["trash can near me", "/map?amenity=trash"],
    ["public restroom", "/map?amenity=restroom"],
    ["parking", "/map?show=parking"],
  ])(
    "answers %s without waiting for live event assembly",
    async (query, expectedHref) => {
      const response = await GET(request(query));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.results[0]).toMatchObject({
        type: "action",
        href: expectedHref,
      });
      expect(mocks.loadEventArchiveSnapshot).not.toHaveBeenCalled();
    },
  );

  it("keeps live event enrichment for map event searches", async () => {
    const response = await GET(request("Radius Investor Showcase"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.loadEventArchiveSnapshot).toHaveBeenCalledWith(
      expect.any(Date),
      { timeoutMs: 650 },
    );
    expect(body.results).toContainEqual(
      expect.objectContaining({
        id: "event:radius-investor-showcase",
        title: "Radius Investor Showcase",
      }),
    );
  });

  it("returns an ordinary local place search without assembling the calendar", async () => {
    const response = await GET(request("coffee nearby"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toContainEqual(
      expect.objectContaining({ type: "place" }),
    );
    expect(mocks.loadEventArchiveSnapshot).not.toHaveBeenCalled();
  });

  it("lets map ATM searches fall through to the live provider", async () => {
    const response = await GET(request("ATM"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([]);
    expect(mocks.loadEventArchiveSnapshot).not.toHaveBeenCalled();
  });

  it("preserves the ATM handoff in global search", async () => {
    const response = await GET(request("ATM", "global"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results[0]).toMatchObject({
      id: "action:map-atm",
      href: "/map?q=ATM",
    });
    expect(mocks.loadEventArchiveSnapshot).not.toHaveBeenCalled();
  });

  it("labels honest base results when live event enrichment rejects", async () => {
    mocks.loadEventArchiveSnapshot.mockRejectedValue(
      new Error("Live event assembly unavailable"),
    );

    const response = await GET(request("events tonight"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.meta.liveEventsUnavailable).toBe(true);
  });

  it.each(["map", "global"])(
    "labels a resolved degraded archive in %s search",
    async (origin) => {
      mocks.loadEventArchiveSnapshot.mockResolvedValue({
        publicEvents: [],
        sourceHealth: {
          degraded: true,
          unavailable: ["event archive"],
        },
      });

      const response = await GET(request("events tonight", origin));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.results.length).toBeGreaterThan(0);
      expect(body.meta.liveEventsUnavailable).toBe(true);
      expect(mocks.recordSearchMiss).not.toHaveBeenCalled();
    },
  );

  it("returns an honest unavailable response and does not bank a false miss", async () => {
    mocks.loadEventArchiveSnapshot.mockResolvedValue({
      publicEvents: [],
      sourceHealth: {
        degraded: true,
        unavailable: ["event archive"],
      },
    });

    const response = await GET(request("zzqxwvnotreal", "global"));
    const body = await response.json();

    // 200, not 503. Both guarantees this test exists for are unchanged: the
    // response still SAYS events are unavailable, and it still refuses to bank
    // a miss it cannot trust. Only the transport changed, because the overlay
    // treats any non-ok as a network failure and rendered "Check your
    // connection" with no links out, over the person's own working connection.
    // A caveat on the answer should not be delivered as a failed request.
    expect(response.status).toBe(200);
    expect(body.results).toEqual([]);
    expect(body.meta.liveEventsUnavailable).toBe(true);
    expect(mocks.recordSearchMiss).not.toHaveBeenCalled();
  });

  it("does not use the map-only fast path for global search", async () => {
    await GET(request("public restroom", "global"));

    expect(mocks.loadEventArchiveSnapshot).toHaveBeenCalledOnce();
  });
});
