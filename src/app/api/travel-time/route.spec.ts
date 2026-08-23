import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  privateTravelTimes: vi.fn(),
  reserveDailyUsage: vi.fn(),
  isRateLimited: vi.fn(),
  isSameOriginMutationRequest: vi.fn(),
}));

vi.mock("@/lib/integrations/google-routes", () => ({
  privateTravelTimes: mocks.privateTravelTimes,
}));
vi.mock("@/lib/usage-meter", () => ({
  reserveDailyUsage: mocks.reserveDailyUsage,
}));

vi.mock("@/lib/origin-check", async () => {
  const actual = await vi.importActual<typeof import("@/lib/origin-check")>(
    "@/lib/origin-check",
  );
  return {
    ...actual,
    isRateLimited: mocks.isRateLimited,
    isSameOriginMutationRequest: mocks.isSameOriginMutationRequest,
  };
});

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new NextRequest("https://frederickradius.app/api/travel-time", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://frederickradius.app",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/travel-time", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSameOriginMutationRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.privateTravelTimes.mockResolvedValue({ walkMin: 8, driveMin: 4 });
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: true, count: 1 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("routes from the consented visitor origin without caching the response", async () => {
    const response = await POST(request({
      fromLat: 39.414,
      fromLng: -77.411,
      lat: 39.421,
      lng: -77.407,
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ walkMin: 8, driveMin: 4 });
    expect(mocks.privateTravelTimes).toHaveBeenCalledWith(
      { lat: 39.414, lng: -77.411 },
      { lat: 39.421, lng: -77.407 },
    );
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "budget_google_routes_private",
      100,
    );
    expect(mocks.reserveDailyUsage.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.privateTravelTimes.mock.invocationCallOrder[0],
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("refuses to invent a downtown origin when no visitor origin is supplied", async () => {
    const response = await POST(request({ lat: 39.421, lng: -77.407 }));

    expect(response.status).toBe(400);
    expect(mocks.privateTravelTimes).not.toHaveBeenCalled();
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
  });

  it("does no paid routing work for an out-of-county origin", async () => {
    const response = await POST(request({
      fromLat: 38.907,
      fromLng: -77.037,
      lat: 39.421,
      lng: -77.407,
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(mocks.privateTravelTimes).not.toHaveBeenCalled();
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
  });

  it("requires a same-origin JSON request before doing paid work", async () => {
    mocks.isSameOriginMutationRequest.mockReturnValue(false);
    const forbidden = await POST(request({}));
    expect(forbidden.status).toBe(403);

    mocks.isSameOriginMutationRequest.mockReturnValue(true);
    const unsupported = await POST(new NextRequest(
      "https://frederickradius.app/api/travel-time",
      { method: "POST", body: "{}" },
    ));
    expect(unsupported.status).toBe(415);
    expect(mocks.privateTravelTimes).not.toHaveBeenCalled();
  });

  it("fails closed when the shared daily travel allowance is unavailable", async () => {
    mocks.reserveDailyUsage.mockResolvedValue(null);

    const response = await POST(request({
      fromLat: 39.414,
      fromLng: -77.411,
      lat: 39.421,
      lng: -77.407,
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(mocks.privateTravelTimes).not.toHaveBeenCalled();
  });

  it.each([
    ["not-a-number", 100],
    ["0", 1],
    ["9999", 150],
  ])("bounds GOOGLE_ROUTES_PRIVATE_DAILY_CAP=%s to %i", async (value, expected) => {
    vi.stubEnv("GOOGLE_ROUTES_PRIVATE_DAILY_CAP", value);

    await POST(request({
      fromLat: 39.414,
      fromLng: -77.411,
      lat: 39.421,
      lng: -77.407,
    }));

    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "budget_google_routes_private",
      expected,
    );
  });
});
