import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getMapboxTravelMatrix: vi.fn(),
  isRateLimited: vi.fn(),
}));

vi.mock("@/lib/integrations/mapboxMatrix", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/integrations/mapboxMatrix")
  >("@/lib/integrations/mapboxMatrix");
  return {
    ...actual,
    getMapboxTravelMatrix: mocks.getMapboxTravelMatrix,
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
  profile: "walking",
  origin: { lng: -77.41049, lat: 39.41437 },
  destinations: [
    { lng: -77.40712, lat: 39.41601 },
    { lng: -77.41674, lat: 39.41272 },
  ],
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
  return new NextRequest("https://frederickradius.app/api/travel-matrix", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/travel-matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.getMapboxTravelMatrix.mockResolvedValue({
      ok: true,
      profile: "walking",
      origin: { lng: -77.41, lat: 39.414 },
      legs: [],
    });
  });

  it("normalizes the explicit body before calling the paid service", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.getMapboxTravelMatrix).toHaveBeenCalledWith({
      profile: "walking",
      origin: { lng: -77.41, lat: 39.414 },
      destinations: [
        { lng: -77.407, lat: 39.416 },
        { lng: -77.417, lat: 39.413 },
      ],
    });
  });

  it("rejects a foreign browser origin before spending upstream", async () => {
    const response = await POST(
      request(BODY, { origin: "https://example.com" }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "forbidden-origin",
    });
    expect(mocks.getMapboxTravelMatrix).not.toHaveBeenCalled();
  });

  it("requires JSON and caps the body before parsing", async () => {
    const unsupported = await POST(
      request(BODY, { contentType: "text/plain" }),
    );
    expect(unsupported.status).toBe(415);
    expect(await unsupported.json()).toEqual({
      ok: false,
      reason: "unsupported-media-type",
    });

    const oversized = await POST(
      request(BODY, { contentLength: String(4 * 1024 + 1) }),
    );
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toEqual({
      ok: false,
      reason: "body-too-large",
    });
    expect(mocks.getMapboxTravelMatrix).not.toHaveBeenCalled();
  });

  it("returns clear validation errors without calling Mapbox", async () => {
    const response = await POST(
      request({ ...BODY, destinations: [BODY.destinations[0]] }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "too-few-destinations",
    });
    expect(mocks.getMapboxTravelMatrix).not.toHaveBeenCalled();
  });

  it("rate-limits the paid endpoint before reading the body", async () => {
    mocks.isRateLimited.mockResolvedValue(true);

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.json()).toEqual({
      ok: false,
      reason: "rate-limited",
    });
    expect(mocks.getMapboxTravelMatrix).not.toHaveBeenCalled();
  });

  it("keeps an upstream failure fail-soft and structured", async () => {
    mocks.getMapboxTravelMatrix.mockResolvedValue({
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
