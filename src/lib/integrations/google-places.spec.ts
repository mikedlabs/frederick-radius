import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  meterUsage: vi.fn(),
}));

vi.mock("@/lib/usage-meter", () => ({
  meterUsage: mocks.meterUsage,
}));

import {
  decisionFeatures,
  getPlaceDetails,
  googlePlacesPaidUpstream,
  normalizeGooglePhotoAttributions,
  normalizeGooglePlaceSummary,
  pickReview,
  resolveAndEnrich,
} from "./google-places";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Google Places billing tiers", () => {
  it.each([
    ["details", "status", "google_place_details_pro"],
    ["details", "hours", "google_place_details_enterprise"],
    ["details", "basic", "google_place_details_enterprise"],
    ["details", "lean", "google_place_details_enterprise"],
    ["details", "full", "google_place_details_enterprise_atmosphere"],
    ["details", "photos", null],
    ["details", "photo-resolve", "google_place_details_pro"],
    ["details", "experience", "google_place_details_enterprise_atmosphere"],
    ["text-search", "status", "google_text_search_pro"],
    ["text-search", "hours", "google_text_search_enterprise"],
    ["text-search", "basic", "google_text_search_enterprise"],
    ["text-search", "lean", "google_text_search_enterprise"],
    ["text-search", "full", "google_text_search_enterprise_atmosphere"],
    ["text-search", "photos", "google_text_search_pro"],
    ["text-search", "photo-resolve", "google_text_search_pro"],
    ["text-search", "experience", "google_text_search_enterprise_atmosphere"],
  ] as const)("maps %s / %s to %s", (method, fields, upstream) => {
    expect(googlePlacesPaidUpstream(method, fields)).toBe(upstream);
  });

  it("keeps the lean Details mask at Enterprise and meters the outbound attempt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "ChIJtest", businessStatus: "OPERATIONAL" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPlaceDetails("ChIJtest", "lean")).resolves.toMatchObject({
      google_place_id: "ChIJtest",
    });

    expect(mocks.meterUsage).toHaveBeenCalledOnce();
    expect(mocks.meterUsage).toHaveBeenCalledWith(
      "google_place_details_enterprise",
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const mask = new Headers(init.headers).get("X-Goog-FieldMask");
    expect(mask).toContain("rating");
    expect(mask).not.toContain("editorialSummary");
    expect(mask).not.toContain("reviews");
  });

  it("meters user-requested Text Search as Enterprise + Atmosphere", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [{
          id: "ChIJtest",
          businessStatus: "OPERATIONAL",
          displayName: { text: "Test Place" },
        }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveAndEnrich({ name: "Test Place" }, "experience"),
    ).resolves.toMatchObject({ google_place_id: "ChIJtest" });

    expect(mocks.meterUsage).toHaveBeenCalledOnce();
    expect(mocks.meterUsage).toHaveBeenCalledWith(
      "google_text_search_enterprise_atmosphere",
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const mask = new Headers(init.headers).get("X-Goog-FieldMask");
    expect(mask).toContain("places.editorialSummary");
    expect(mask).toContain("places.generativeSummary");
  });

  it("does not meter a request when Google Places is not configured", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPlaceDetails("ChIJtest", "status")).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.meterUsage).not.toHaveBeenCalled();
  });
});

describe("pickReview", () => {
  it("preserves the selected review's author and Google Maps links", () => {
    const selected = pickReview([
      {
        rating: 5,
        text: { text: "The parking was easy and the bathroom was very clean for our quick stop." },
        authorAttribution: { displayName: "Logistics only" },
      },
      {
        rating: 4,
        text: { text: "Thoughtful seasonal dishes, warm service, and a room that felt distinctly local." },
        authorAttribution: {
          displayName: "Frederick Neighbor",
          uri: "https://maps.google.com/maps/contrib/example",
          photoUri: "https://lh3.googleusercontent.com/example",
        },
        googleMapsUri: "https://www.google.com/maps/reviews/example",
        flagContentUri: "https://www.google.com/local/review/rap/report?postId=example",
      },
    ]);

    expect(selected).toEqual({
      snippet: "Thoughtful seasonal dishes, warm service, and a room that felt distinctly local.",
      author: "Frederick Neighbor",
      authorUri: "https://maps.google.com/maps/contrib/example",
      authorPhotoUri: "https://lh3.googleusercontent.com/example",
      googleMapsUri: "https://www.google.com/maps/reviews/example",
      flagContentUri: "https://www.google.com/local/review/rap/report?postId=example",
    });
  });

  it("returns no review when the documented rating and length filters reject all candidates", () => {
    expect(pickReview([
      { rating: 3, text: { text: "This review is long enough but below the published rating threshold." } },
      { rating: 5, text: { text: "Too short." } },
    ])).toBeUndefined();
  });
});

describe("normalizeGooglePlaceSummary", () => {
  it("prefers the current summary flag URI and retains the legacy fallback", () => {
    const common = {
      overview: { text: "A current summary." },
      disclosureText: { text: "Summarized with Google Maps." },
    };
    expect(normalizeGooglePlaceSummary({
      ...common,
      flagContentUri: "https://www.google.com/local/summary/report/current",
      overviewFlagContentUri: "https://www.google.com/local/summary/report/legacy",
    })?.report_uri).toBe("https://www.google.com/local/summary/report/current");
    expect(normalizeGooglePlaceSummary({
      ...common,
      overviewFlagContentUri: "https://www.google.com/local/summary/report/legacy",
    })?.report_uri).toBe("https://www.google.com/local/summary/report/legacy");
  });
});

describe("normalizeGooglePhotoAttributions", () => {
  it("keeps the individual photo source and report links on the exact resource", () => {
    expect(normalizeGooglePhotoAttributions([{
      name: "places/ChIJtest/photos/photo-one",
      googleMapsUri: "https://www.google.com/maps/photos/photo-one",
      flagContentUri: "https://www.google.com/local/photo/report?id=1",
      authorAttributions: [{ displayName: "A photographer" }],
    }])).toEqual([{
      photo_name: "places/ChIJtest/photos/photo-one",
      google_maps_uri: "https://www.google.com/maps/photos/photo-one",
      flag_content_uri: "https://www.google.com/local/photo/report?id=1",
      authors: [{
        display_name: "A photographer",
        uri: undefined,
        photo_uri: undefined,
      }],
    }]);
  });
});

describe("decisionFeatures", () => {
  it("returns only explicitly true visit-decision attributes", () => {
    expect(decisionFeatures({
      outdoorSeating: true,
      allowsDogs: false,
      reservable: true,
      servesBreakfast: true,
      restroom: undefined,
    })).toEqual(["outdoor_seating", "reservable", "serves_breakfast"]);
  });
});
