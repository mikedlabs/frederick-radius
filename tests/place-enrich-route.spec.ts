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
    "outside-place": {
      slug: "outside-place",
      name: "Outside Place",
      address: "1 Main St",
      city: "Boonsboro",
      google_place_id: "ChIJoutside",
      geom: { lng: -77.6528, lat: 39.5062 },
    },
  },
}));
vi.mock("@/data/places-overrides.json", () => ({ default: { patch: {} } }));
vi.mock("@/lib/integrations/google-places", () => ({
  getPlaceDetails: mocks.getPlaceDetails,
  resolveAndEnrich: mocks.resolveAndEnrich,
}));

import { GET } from "@/app/api/place/[slug]/enrich/route";

function request(mode?: "experience") {
  const suffix = mode ? `?mode=${mode}` : "";
  return new Request(`https://frederickradius.app/api/place/test-place/enrich${suffix}`, {
    headers: {
      Referer: "https://frederickradius.app/places/test-place",
      "x-forwarded-for": "203.0.113.22",
    },
  });
}

const context = { params: Promise.resolve({ slug: "test-place" }) };
const outsideContext = {
  params: Promise.resolve({ slug: "outside-place" }),
};

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

  it("never spends on a source row outside the county catalog area", async () => {
    const response = await GET(
      new Request(
        "https://frederickradius.app/api/place/outside-place/enrich",
        {
          headers: {
            Referer:
              "https://frederickradius.app/places/outside-place",
            "x-forwarded-for": "203.0.113.22",
          },
        },
      ),
      outsideContext,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ photos: [], hours: [] });
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
    expect(mocks.resolveAndEnrich).not.toHaveBeenCalled();
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
    expect(mocks.getPlaceDetails).toHaveBeenCalledWith("ChIJtest", "basic");
    expect((await response.json()).hours).toEqual(["Monday: 9:00 AM – 5:00 PM"]);
  });

  it("requests rich Google context only for an explicit experience request", async () => {
    mocks.getPlaceDetails.mockResolvedValue({
      photo_names: [],
      weekday_hours: [],
      business_status: "OPERATIONAL",
      has_hours: false,
      google_place_id: "ChIJtest",
      photo_attributions: [],
      decision_features: ["outdoor_seating"],
      review_flag_content_uri: "https://www.google.com/local/review/report?id=1",
    });

    const response = await GET(request("experience"), context);

    expect(response.status).toBe(200);
    expect(mocks.isRateLimited).toHaveBeenNthCalledWith(
      2,
      expect.any(Request),
      "place-enrich-experience",
      8,
      60,
    );
    expect(mocks.getPlaceDetails).toHaveBeenCalledWith("ChIJtest", "experience");
    expect((await response.json()).review_flag_content_uri).toBe(
      "https://www.google.com/local/review/report?id=1",
    );
  });

  it("returns only photos with exact metadata and an individual source link", async () => {
    const publishable = "places/ChIJtest/photos/publishable";
    const legacy = "places/ChIJtest/photos/legacy";
    mocks.getPlaceDetails.mockResolvedValue({
      photo_names: [publishable, legacy],
      weekday_hours: [],
      business_status: "OPERATIONAL",
      has_hours: false,
      google_place_id: "ChIJtest",
      photo_attributions: [{
        photo_name: publishable,
        google_maps_uri: "https://www.google.com/maps/photos/publishable",
        flag_content_uri: "https://www.google.com/local/photo/report?id=1",
        authors: [{ display_name: "A photographer" }],
      }],
    });

    const response = await GET(request(), context);
    const body = await response.json();

    expect(body.photos).toEqual([
      `/api/place-photo?name=${encodeURIComponent(publishable)}&w=800`,
    ]);
    expect(body.photo_attributions).toHaveLength(1);
    expect(body.photo_attributions[0].flag_content_uri).toBe(
      "https://www.google.com/local/photo/report?id=1",
    );
  });

  it("applies the experience budget fence before a paid Google call", async () => {
    mocks.isRateLimited.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const response = await GET(request("experience"), context);

    expect(response.status).toBe(429);
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
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
