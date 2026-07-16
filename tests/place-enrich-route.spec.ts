import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isSameOriginRequest: vi.fn(),
  isRateLimited: vi.fn(),
  getPlaceDetails: vi.fn(),
  resolveAndEnrich: vi.fn(),
}));

vi.mock("@/lib/origin-check", () => ({
  isSameOriginRequest: mocks.isSameOriginRequest,
  isRateLimited: mocks.isRateLimited,
}));
vi.mock("@/data/places", () => ({
  PLACE_BY_SLUG: {
    "test-place": {
      slug: "test-place",
      name: "Test Place",
      address: "1 Market St",
      city: "Frederick",
      google_place_id: "ChIJtest",
      geom: { lng: -77.41, lat: 39.414 },
    },
  },
}));
vi.mock("@/data/places-overrides.json", () => ({ default: { patch: {} } }));
vi.mock("@/lib/integrations/google-places", () => ({
  getPlaceDetails: mocks.getPlaceDetails,
  resolveAndEnrich: mocks.resolveAndEnrich,
}));

import { GET } from "@/app/api/place/[slug]/enrich/route";

function request() {
  return new Request("https://frederickradius.app/api/place/test-place/enrich", {
    headers: {
      Referer: "https://frederickradius.app/places/test-place",
      "x-forwarded-for": "203.0.113.22",
    },
  });
}

const context = { params: Promise.resolve({ slug: "test-place" }) };

describe("GET /api/place/[slug]/enrich", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.getPlaceDetails.mockResolvedValue(null);
  });

  it("rejects a foreign request before a paid Google call", async () => {
    mocks.isSameOriginRequest.mockReturnValue(false);

    const response = await GET(request(), context);

    expect(response.status).toBe(403);
    expect(mocks.isRateLimited).not.toHaveBeenCalled();
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("rate-limits before a paid Google call", async () => {
    mocks.isRateLimited.mockResolvedValue(true);

    const response = await GET(request(), context);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("never permits Google content to enter a shared cache", async () => {
    mocks.getPlaceDetails.mockResolvedValue({
      photo_names: [],
      weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
      business_status: "OPERATIONAL",
      has_hours: true,
      google_place_id: "ChIJtest",
      photo_attributions: [],
    });

    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(mocks.getPlaceDetails).toHaveBeenCalledWith("ChIJtest");
    expect((await response.json()).hours).toEqual(["Monday: 9:00 AM – 5:00 PM"]);
  });

  it("does not reintroduce an unreviewed all-week 24/7 claim", async () => {
    mocks.getPlaceDetails.mockResolvedValue({
      photo_names: [],
      weekday_hours: [
        "Monday: Open 24 hours",
        "Tuesday: Open 24 hours",
        "Wednesday: Open 24 hours",
        "Thursday: Open 24 hours",
        "Friday: Open 24 hours",
        "Saturday: Open 24 hours",
        "Sunday: Open 24 hours",
      ],
      business_status: "OPERATIONAL",
      has_hours: true,
      google_place_id: "ChIJtest",
      photo_attributions: [],
    });

    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect((await response.json()).hours).toEqual([]);
  });
});
