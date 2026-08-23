import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decisionFeatures,
  getPlaceDetailsResult,
  normalizeGooglePhotoAttributions,
  normalizeGooglePlaceSummary,
  pickReview,
  resolveAndEnrichResult,
} from "./google-places";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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

describe("maintenance lookup results", () => {
  it("does not turn a Place Details provider failure into a no-match", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("quota", { status: 429 })));

    await expect(getPlaceDetailsResult("ChIJtest", "full")).resolves.toEqual({
      status: "provider_error",
      reason: "http_429",
    });
  });

  it("distinguishes a valid empty search from a provider outage", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockRejectedValueOnce(new Error("network unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveAndEnrichResult({ name: "Missing Place" }, "full"))
      .resolves.toEqual({ status: "no_match" });
    await expect(resolveAndEnrichResult({ name: "Retry Later" }, "full"))
      .resolves.toEqual({ status: "provider_error", reason: "request_failed" });
  });
});
