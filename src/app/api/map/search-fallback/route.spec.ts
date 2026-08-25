import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  searchMapboxTemporary: vi.fn(),
  isRateLimited: vi.fn(),
}));

vi.mock("@/lib/integrations/mapboxSearchBox", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/integrations/mapboxSearchBox")
  >("@/lib/integrations/mapboxSearchBox");
  return {
    ...actual,
    searchMapboxTemporary: mocks.searchMapboxTemporary,
  };
});

vi.mock("@/lib/origin-check", async () => {
  const actual = await vi.importActual<typeof import("@/lib/origin-check")>(
    "@/lib/origin-check",
  );
  return { ...actual, isRateLimited: mocks.isRateLimited };
});

import { POST } from "./route";

const BODY = {
  action: "suggest",
  q: "coffee and bikes",
  sessionToken: "2d9f68fb-5d4c-4b28-9d8e-cc2e2bc6e99e",
  proximity: { lng: -77.41049, lat: 39.41437 },
};

function request(
  body: unknown = BODY,
  options: {
    origin?: string;
    contentType?: string;
    contentLength?: string;
  } = {},
) {
  const headers = new Headers({
    origin: options.origin ?? "https://frederickradius.app",
    "content-type": options.contentType ?? "application/json",
  });
  if (options.contentLength) {
    headers.set("content-length", options.contentLength);
  }
  return new NextRequest(
    "https://frederickradius.app/api/map/search-fallback",
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/map/search-fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.searchMapboxTemporary.mockResolvedValue({
      ok: true,
      action: "suggest",
      temporary: true,
      provider: "Mapbox",
      suggestions: [],
    });
  });

  it("normalizes the temporary suggest request before spending upstream", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.searchMapboxTemporary).toHaveBeenCalledWith({
      action: "suggest",
      q: "coffee and bikes",
      sessionToken: BODY.sessionToken,
      proximity: { lng: -77.41, lat: 39.414 },
      limit: 4,
    });
  });

  it("supports retrieve with the same explicit session context", async () => {
    mocks.searchMapboxTemporary.mockResolvedValue({
      ok: true,
      action: "retrieve",
      temporary: true,
      provider: "Mapbox",
      result: {
        mapboxId: "mapbox.place.1",
        name: "A local place",
        featureType: "poi",
        coordinates: { lng: -77.4105, lat: 39.4144 },
      },
    });

    const response = await POST(
      request({
        action: "retrieve",
        mapboxId: "mapbox.place.1",
        sessionToken: BODY.sessionToken,
        proximity: BODY.proximity,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.searchMapboxTemporary).toHaveBeenCalledWith({
      action: "retrieve",
      mapboxId: "mapbox.place.1",
      sessionToken: BODY.sessionToken,
      proximity: { lng: -77.41, lat: 39.414 },
    });
  });

  it("rejects foreign origins, non-JSON, and oversized bodies", async () => {
    const forbidden = await POST(
      request(BODY, { origin: "https://example.com" }),
    );
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({
      ok: false,
      reason: "forbidden-origin",
    });

    const unsupported = await POST(
      request(BODY, { contentType: "text/plain" }),
    );
    expect(unsupported.status).toBe(415);
    expect(await unsupported.json()).toEqual({
      ok: false,
      reason: "unsupported-media-type",
    });

    const oversized = await POST(
      request(BODY, { contentLength: String(16 * 1024 + 1) }),
    );
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toEqual({
      ok: false,
      reason: "body-too-large",
    });
    expect(mocks.searchMapboxTemporary).not.toHaveBeenCalled();
  });

  it("returns validation errors without calling Mapbox", async () => {
    const response = await POST(
      request({ ...BODY, proximity: { lng: -76.6, lat: 39.4 } }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "outside-county",
    });
    expect(mocks.searchMapboxTemporary).not.toHaveBeenCalled();
  });

  it("rate-limits before reading the paid request", async () => {
    mocks.isRateLimited.mockResolvedValue(true);

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.json()).toEqual({
      ok: false,
      reason: "rate-limited",
    });
    expect(mocks.searchMapboxTemporary).not.toHaveBeenCalled();
  });

  it("keeps upstream failures fail-soft and structured", async () => {
    mocks.searchMapboxTemporary.mockResolvedValue({
      ok: false,
      reason: "upstream-timeout",
      retryable: true,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "upstream-timeout",
      retryable: true,
    });
  });
});
