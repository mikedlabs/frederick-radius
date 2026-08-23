import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  isOverPaidRequestBudget: vi.fn(),
  isSameOriginRequest: vi.fn(),
  photoUrl: vi.fn(),
  reserveDailyUsage: vi.fn(),
}));

vi.mock("@/lib/integrations/google-places", () => ({
  photoUrl: mocks.photoUrl,
}));

vi.mock("@/data/places", () => ({ PLACE_BY_SLUG: {} }));
vi.mock("@/data/categories", () => ({ CATEGORY_BY_SLUG: {} }));

vi.mock("@/lib/origin-check", () => ({
  isOverPaidRequestBudget: mocks.isOverPaidRequestBudget,
  isSameOriginRequest: mocks.isSameOriginRequest,
}));

vi.mock("@/lib/usage-meter", () => ({
  reserveDailyUsage: mocks.reserveDailyUsage,
}));

import { GET } from "./route";

function request() {
  const params = new URLSearchParams({
    name: "places/test-place/photos/test-photo",
    w: "800",
  });
  return new NextRequest(
    `https://frederickradius.app/api/place-photo?${params.toString()}`,
  );
}

describe("GET /api/place-photo daily budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_PHOTO_DAILY_CAP", "");
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.isOverPaidRequestBudget.mockResolvedValue(false);
    mocks.photoUrl.mockReturnValue("https://places.googleapis.test/photo");
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: true, count: 1 });
    mocks.fetch.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reserves the default 50-call budget before the paid fetch", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("x-photo-fallback")).toBeNull();
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith("google_photo", 50);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.reserveDailyUsage.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.fetch.mock.invocationCallOrder[0],
    );
  });

  it("returns the existing image fallback without fetching when the cap is exhausted", async () => {
    vi.stubEnv("GOOGLE_PHOTO_DAILY_CAP", "7");
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: false, count: 7 });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("x-photo-fallback")).toBe("daily-cap");
    expect(await response.text()).toContain("PHOTO NOT AVAILABLE");
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith("google_photo", 7);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("uses the conservative default for a malformed cap without exposing it", async () => {
    const malformed = "100photos-private-value";
    vi.stubEnv("GOOGLE_PHOTO_DAILY_CAP", malformed);
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: false, count: 50 });

    const response = await GET(request());
    const body = await response.text();

    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith("google_photo", 50);
    expect(response.headers.get("x-photo-fallback")).toBe("daily-cap");
    expect(body).not.toContain(malformed);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["0", 1],
    ["100000", 100],
  ])("clamps a numeric cap of %s to %i", async (configured, expected) => {
    vi.stubEnv("GOOGLE_PHOTO_DAILY_CAP", configured);

    await GET(request());

    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "google_photo",
      expected,
    );
  });

  it("fails closed to the existing image fallback when the budget database is unavailable", async () => {
    mocks.reserveDailyUsage.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("x-photo-fallback")).toBe(
      "budget-unavailable",
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
