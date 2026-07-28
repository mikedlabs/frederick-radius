import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  isSameOriginRequest: vi.fn(),
  isRateLimited: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/origin-check", () => ({
  isSameOriginRequest: mocks.isSameOriginRequest,
  isRateLimited: mocks.isRateLimited,
}));

vi.stubGlobal("fetch", mocks.fetch);

function request() {
  return new NextRequest(
    "https://frederickradius.app/api/aviation/rotorcraft",
    { headers: { Referer: "https://frederickradius.app/map" } },
  );
}

describe("/api/aviation/rotorcraft", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
  });

  it("returns Trooper as aggregate status and only coarse generic positions", async () => {
    const now = Date.now();
    mocks.fetch.mockResolvedValue(
      Response.json({
        now,
        ac: [
          {
            hex: "abc123",
            r: "N123PRIVATE",
            flight: "TRP3 ",
            category: "A7",
            t: "A139",
            lat: 39.55,
            lon: -77.4,
            alt_baro: 1_500,
            gs: 90,
            track: 180,
            baro_rate: 300,
            seen_pos: 1,
          },
          {
            hex: "generic1",
            r: "N45TEST",
            flight: "N45TEST",
            category: "A7",
            t: "EC35",
            lat: 39.50123,
            lon: -77.40329,
            alt_baro: 2_043,
            gs: 83,
            track: 127,
            seen_pos: 2,
          },
        ],
      }),
    );
    const { GET } = await import("./route");

    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://api.adsb.lol/v2/point/39.47/-77.38/22",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(json).toMatchObject({
      available: true,
      coverage: "incomplete",
      source: "ADSB.lol",
      attribution: expect.stringContaining("ODbL"),
      observationCount: 2,
      trooperAirborneCount: 1,
      signals: [
        {
          lat: 39.5,
          lng: -77.4,
          altitudeFt: 2_000,
          groundSpeedKt: 85,
        },
      ],
    });
    expect(json.signals[0].id).toMatch(/^[a-f0-9]{16}$/);
    expect(json.signals[0]).not.toHaveProperty("trackDeg");
    const publicJson = JSON.stringify(json);
    expect(publicJson).not.toContain("TRP3");
    expect(publicJson).not.toContain("abc123");
    expect(publicJson).not.toContain("generic1");
    expect(publicJson).not.toContain("N123PRIVATE");
    expect(publicJson).not.toContain("N45TEST");
    expect(publicJson).not.toContain("publicCallsign");
    expect(publicJson).not.toContain("39.50123");
    expect(publicJson).not.toContain("-77.40329");
  });

  it("returns FMH activity only as an aggregate at the fixed heliport", async () => {
    const now = Date.now();
    mocks.fetch.mockResolvedValue(
      Response.json({
        now,
        ac: [
          {
            hex: "medical1",
            flight: "MEDICAL1",
            category: "A7",
            lat: 39.4145278,
            lon: -77.4149444,
            alt_baro: 1_300,
            gs: 90,
            track: 0,
            baro_rate: -500,
            seen_pos: 1,
          },
        ],
      }),
    );
    const { GET } = await import("./route");

    const response = await GET(request());
    const json = await response.json();

    expect(json).toMatchObject({
      observationCount: 1,
      signals: [],
      trooperAirborneCount: 0,
      fmhActivity: {
        possibleArrivalCount: 1,
        possibleDepartureCount: 0,
        helicopterNearbyCount: 0,
      },
    });
    expect(JSON.stringify(json)).not.toContain("medical1");
    expect(JSON.stringify(json)).not.toContain("MEDICAL1");
    expect(JSON.stringify(json)).not.toContain("39.4145278");
  });

  it("fails soft with zero attention counts when the public feed is down", async () => {
    mocks.fetch.mockRejectedValue(new Error("offline"));
    const { GET } = await import("./route");

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      observationCount: 0,
      signals: [],
      trooperAirborneCount: 0,
      fmhActivity: {
        possibleArrivalCount: 0,
        possibleDepartureCount: 0,
        helicopterNearbyCount: 0,
      },
      available: false,
      coverage: "unavailable",
      source: "ADSB.lol",
    });
  });

  it("rate-limits before reaching the upstream", async () => {
    mocks.isRateLimited.mockResolvedValue(true);
    const { GET } = await import("./route");

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
