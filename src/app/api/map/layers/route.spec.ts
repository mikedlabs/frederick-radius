import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isSameOriginRequest: vi.fn(() => true),
  isRateLimited: vi.fn(async () => false),
  mapPinPlaces: vi.fn(() => []),
  fetchMapillaryTrash: vi.fn(async () => []),
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
    expect(mocks.mapPinPlaces).toHaveBeenCalledOnce();
  });
});
