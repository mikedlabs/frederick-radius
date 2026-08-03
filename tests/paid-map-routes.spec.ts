import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  isSameOriginRequest: vi.fn(),
  isRateLimited: vi.fn(),
  meterUsage: vi.fn(),
}));

vi.mock("@/lib/origin-check", () => ({
  isSameOriginRequest: mocks.isSameOriginRequest,
  isRateLimited: mocks.isRateLimited,
}));
vi.mock("@/lib/usage-meter", () => ({ meterUsage: mocks.meterUsage }));
vi.mock("@/lib/mapbox", () => ({
  MAPBOX_TOKEN: "test-mapbox-token",
  MAPBOX_SERVER_HEADERS: { Referer: "https://frederickradius.app/" },
}));

import { GET } from "@/app/api/static-map/route";

function request(pin = "e14328", size = "640x352") {
  return new NextRequest(
    `https://frederickradius.app/api/static-map?lng=-77.41062&lat=39.41437&pin=${pin}&size=${size}`,
    { headers: { Referer: "https://frederickradius.app/places/test" } },
  );
}

describe("paid static-map proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
  });

  it("rejects a foreign embed before doing paid work", async () => {
    mocks.isSameOriginRequest.mockReturnValue(false);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mocks.isRateLimited).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("rejects arbitrary attacker-controlled pin colors", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await GET(request("abcdef"));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("rounds locator coordinates and caches a valid upstream image", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "pin-s+e14328(-77.4106,39.4144)/-77.4106,39.4144,14.6,0/640x352@2x",
    );
    expect(response.headers.get("cache-control")).toContain("s-maxage=2592000");
    fetchMock.mockRestore();
  });

  it("accepts the compact place locator size", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Length": "3",
        },
      }),
    );

    const response = await GET(request("e14328", "320x150"));

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/320x150@2x");
    expect(response.headers.get("content-length")).toBe("3");
    fetchMock.mockRestore();
  });
});
