import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isSameOriginRequest: vi.fn(() => true),
  isRateLimited: vi.fn(async () => false),
  mapPinPlaces: vi.fn(() => []),
  fetchMapillaryTrash: vi.fn(async () => []),
  getFieldAmenities: vi.fn(async () => []),
  getCurrentSituationSnapshot: vi.fn<() => Promise<unknown>>(async () => null),
  getRoadIntelligenceSnapshot: vi.fn<() => Promise<unknown>>(async () => null),
  marketsOpenToday: vi.fn(async () => []),
  loadTodayEventSnapshot: vi.fn<() => Promise<unknown>>(async () => ({
    unified: [],
    publicEvents: [],
    sourceHealth: { degraded: false, unavailable: [], issues: [] },
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/origin-check", () => ({
  isSameOriginRequest: mocks.isSameOriginRequest,
  isRateLimited: mocks.isRateLimited,
}));
vi.mock("@/lib/map/placePins", () => ({
  mapPinPlaces: mocks.mapPinPlaces,
}));
vi.mock("@/lib/integrations/mapillary", () => ({
  fetchMapillaryTrash: mocks.fetchMapillaryTrash,
}));
vi.mock("@/lib/loaders/fieldAmenities", () => ({
  getFieldAmenities: mocks.getFieldAmenities,
}));
vi.mock("@/lib/live/currentSituation", () => ({
  getCurrentSituationSnapshot: mocks.getCurrentSituationSnapshot,
}));
vi.mock("@/lib/live/roadIntelligence", () => ({
  getRoadIntelligenceSnapshot: mocks.getRoadIntelligenceSnapshot,
}));
vi.mock("@/lib/markets-today", () => ({
  marketsOpenToday: mocks.marketsOpenToday,
}));
vi.mock("@/lib/loaders/todayEventSnapshot", () => ({
  loadTodayEventSnapshot: mocks.loadTodayEventSnapshot,
}));

import { GET } from "./route";

function request(search = "?groups=context", headers?: HeadersInit) {
  return new Request(`https://frederickradius.app/api/map/layers${search}`, {
    headers,
  });
}

describe("GET /api/map/layers request boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.getCurrentSituationSnapshot.mockResolvedValue(null);
    mocks.getRoadIntelligenceSnapshot.mockResolvedValue(null);
    mocks.marketsOpenToday.mockResolvedValue([]);
    mocks.loadTodayEventSnapshot.mockResolvedValue({
      unified: [],
      publicEvents: [],
      sourceHealth: { degraded: false, unavailable: [], issues: [] },
    });
  });

  it("redirects the empty URL to the one canonical context key", async () => {
    const response = await GET(request(""));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://frederickradius.app/api/map/layers?groups=context",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.mapPinPlaces).not.toHaveBeenCalled();
  });

  it.each([
    "?groups=amenities&nonce=1",
    "?nonce=1&groups=amenities",
    "?groups=amenities,roads",
    "?groups=amenities&groups=roads",
    "?groups=%61menities",
  ])("rejects cache-key bypass %s before any loader", async (search) => {
    const response = await GET(request(search));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.isRateLimited).not.toHaveBeenCalled();
    expect(mocks.mapPinPlaces).not.toHaveBeenCalled();
    expect(mocks.fetchMapillaryTrash).not.toHaveBeenCalled();
  });

  it("rejects a foreign browser source before provider work", async () => {
    mocks.isSameOriginRequest.mockReturnValue(false);

    const response = await GET(
      request("?groups=amenities", { referer: "https://example.org/" }),
    );

    expect(response.status).toBe(403);
    expect(mocks.isRateLimited).not.toHaveBeenCalled();
    expect(mocks.fetchMapillaryTrash).not.toHaveBeenCalled();
  });

  it("rate-limits a canonical miss before provider work", async () => {
    mocks.isRateLimited.mockResolvedValue(true);

    const response = await GET(request("?groups=amenities"));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(mocks.fetchMapillaryTrash).not.toHaveBeenCalled();
  });

  it("serves the canonical local-context request with shared caching", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(response.headers.get("x-radius-map-groups")).toBe("context");
    expect(body.amenities).toEqual(expect.any(Array));
    expect(body.parking).toEqual(expect.any(Array));
    expect(body.sourceHealth.context).toEqual({
      status: "current",
      unavailable: [],
    });
    expect(mocks.mapPinPlaces).toHaveBeenCalledOnce();
    expect(mocks.getFieldAmenities).toHaveBeenCalledOnce();
  });

  it("labels a provider miss instead of presenting its fallback as a real zero", async () => {
    mocks.getFieldAmenities.mockRejectedValueOnce(new Error("provider down"));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=30, stale-while-revalidate=60",
    );
    expect(body.amenities).toEqual(expect.any(Array));
    expect(body.sourceHealth.context).toEqual({
      status: "partial",
      unavailable: ["Radius field notes"],
    });
  });

  it("records optional road-feed outages even when required coverage is complete", async () => {
    mocks.getRoadIntelligenceSnapshot.mockResolvedValueOnce({
      schemaVersion: 1,
      generatedAt: "2026-08-22T12:00:00.000Z",
      sources: {
        workZones: {
          available: true,
          data: [],
          asOf: "2026-08-22T12:00:00.000Z",
          sourceUrl: "https://example.com/work-zones",
        },
        speeds: { available: false, data: [] },
        travelTimes: { available: false, data: [] },
        messages: { available: false, data: [] },
        weatherStations: { available: false, data: [] },
        roadConditions: {
          available: true,
          data: [],
          asOf: "2026-08-22T12:00:00.000Z",
        },
        snowEmergency: {
          available: true,
          data: [],
          asOf: "2026-08-22T12:00:00.000Z",
        },
      },
      attention: [],
      summary: {
        status: "quiet",
        coverage: "complete",
        activeCount: 0,
        unavailable: [
          "travelTimes",
          "speeds",
          "messages",
          "weatherStations",
        ],
      },
    });

    const response = await GET(request("?groups=signals"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=30, stale-while-revalidate=60",
    );
    expect(body.sourceHealth.signals).toEqual({
      status: "unavailable",
      unavailable: [
        "Highway messages",
        "Road weather stations",
        "Traffic speeds",
        "Travel times",
      ],
    });
  });

  it("never exposes an event archive diagnostic as a map source label", async () => {
    mocks.loadTodayEventSnapshot.mockResolvedValueOnce({
      unified: [],
      publicEvents: [],
      sourceHealth: {
        degraded: true,
        unavailable: [
          "read rejected: postgres://user:secret@example.test/database",
        ],
        issues: [{
          code: "event_archive_unavailable",
          message: "read rejected: postgres://user:secret@example.test/database",
        }],
      },
    });

    const response = await GET(request("?groups=events"));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=30, stale-while-revalidate=60",
    );
    expect(text).not.toContain("secret");
    expect(JSON.parse(text).sourceHealth.events).toEqual({
      status: "unavailable",
      unavailable: ["Event schedule"],
    });
  });
});
