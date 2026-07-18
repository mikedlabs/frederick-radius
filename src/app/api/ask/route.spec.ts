import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  askFrederick: vi.fn(),
  approxLocation: vi.fn(),
  isSameOriginMutationRequest: vi.fn(),
  isRateLimited: vi.fn(),
  readJsonBodyWithLimit: vi.fn(),
  meterUsage: vi.fn(),
}));

vi.mock("@/lib/ask/answer", () => ({ askFrederick: mocks.askFrederick }));
vi.mock("@/lib/ip-geo", () => ({ approxLocation: mocks.approxLocation }));
vi.mock("@/lib/origin-check", () => ({
  isSameOriginMutationRequest: mocks.isSameOriginMutationRequest,
  isRateLimited: mocks.isRateLimited,
  readJsonBodyWithLimit: mocks.readJsonBodyWithLimit,
}));
vi.mock("@/lib/usage-meter", () => ({ meterUsage: mocks.meterUsage }));

import { POST } from "./route";

function request(cookie?: string) {
  return new NextRequest("https://frederickradius.app/api/ask", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://frederickradius.app",
      "x-forwarded-for": "198.51.100.42",
      ...(cookie ? { cookie } : {}),
    },
    body: "{}",
  });
}

describe("/api/ask location policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSameOriginMutationRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.readJsonBodyWithLimit.mockResolvedValue({ ok: true, value: { query: "coffee near me" } });
    mocks.approxLocation.mockResolvedValue({
      origin: { lng: -77.6278, lat: 39.3143 },
      status: "available",
    });
    mocks.askFrederick.mockResolvedValue({
      status: "matches",
      configured: true,
      usedModel: false,
      answer: "Countywide matches.",
      sources: [],
    });
  });

  it("ignores network/IP location and falls back to an explicit countywide context", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.approxLocation).not.toHaveBeenCalled();
    expect(mocks.askFrederick).toHaveBeenCalledWith(
      "coffee near me",
      {
        origin: null,
        municipality: null,
        contextLabel: "Whole county",
        canShowDistance: false,
        fallbackReason: "location-unavailable",
      },
      { taste: undefined },
    );
  });

  it("uses a rounded device fix when the visitor supplied one", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { query: "coffee near me", lat: 39.41437, lng: -77.41062 },
    });

    await POST(request());

    expect(mocks.askFrederick).toHaveBeenCalledWith(
      "coffee near me",
      {
        origin: { lat: 39.414, lng: -77.411 },
        municipality: null,
        contextLabel: "Near you",
        canShowDistance: true,
        fallbackReason: null,
      },
      { taste: undefined },
    );
  });

  it("may rank from the saved home town without presenting it as a precise fix", async () => {
    await POST(request("fr_home_muni=brunswick"));

    expect(mocks.askFrederick).toHaveBeenCalledWith(
      "coffee near me",
      expect.objectContaining({
        origin: expect.objectContaining({ lat: expect.any(Number), lng: expect.any(Number) }),
        municipality: null,
        contextLabel: "Ranked from Brunswick",
        fallbackReason: null,
      }),
      { taste: undefined },
    );
  });

  it("honors an explicit whole-county scope even when device coordinates are present", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { query: "coffee", scope: "county", lat: 39.41437, lng: -77.41062 },
    });

    await POST(request());

    expect(mocks.askFrederick).toHaveBeenCalledWith(
      "coffee",
      expect.objectContaining({ origin: null, contextLabel: "Whole county" }),
      { taste: undefined },
    );
  });
});
