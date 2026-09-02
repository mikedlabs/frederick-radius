import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPlaceDetails: vi.fn(),
  googlePlacesConfigured: vi.fn(),
  isOverPaidRequestBudget: vi.fn(),
  isRateLimited: vi.fn(),
  isSameOriginRequest: vi.fn(),
  mayPublishVisitabilityHours: vi.fn(),
  parseGoogleHours: vi.fn(),
  reserveDailyUsage: vi.fn(),
  resolveAndEnrich: vi.fn(),
}));

vi.mock("@/data/places", () => ({
  PLACE_BY_SLUG: {
    "test-place": {
      slug: "test-place",
      name: "Test Place",
      address: "1 Market Street",
      city: "Frederick",
      geom: { lat: 39.4143, lng: -77.4105 },
      google_place_id: "ChIJtest",
    },
  },
}));
vi.mock("@/data/places-overrides.json", () => ({ default: { patch: {} } }));
vi.mock("@/lib/integrations/google-places", () => ({
  getPlaceDetails: mocks.getPlaceDetails,
  googlePlacesConfigured: mocks.googlePlacesConfigured,
  resolveAndEnrich: mocks.resolveAndEnrich,
}));
vi.mock("@/lib/origin-check", () => ({
  isOverPaidRequestBudget: mocks.isOverPaidRequestBudget,
  isRateLimited: mocks.isRateLimited,
  isSameOriginRequest: mocks.isSameOriginRequest,
}));
vi.mock("@/lib/googleHours", () => ({ parseGoogleHours: mocks.parseGoogleHours }));
vi.mock("@/lib/hours-visitability", () => ({
  mayPublishVisitabilityHours: mocks.mayPublishVisitabilityHours,
}));
vi.mock("@/lib/place-status-overrides", () => ({
  activeManualPlaceStatusOverride: vi.fn(() => undefined),
  isManualPlaceClosureOverride: vi.fn(() => false),
}));
vi.mock("@/lib/google-photo-policy", () => ({
  publishableGooglePhotoNames: vi.fn(() => []),
}));
vi.mock("@/lib/geo", () => ({ isValidCoord: vi.fn(() => true) }));
vi.mock("@/lib/overrides", () => ({ patchRecord: vi.fn((place) => place) }));
vi.mock("@/lib/usage-meter", () => ({ reserveDailyUsage: mocks.reserveDailyUsage }));

import { GET } from "./route";

const params = { params: Promise.resolve({ slug: "test-place" }) };

function request(mode?: "experience") {
  return new Request(
    `https://frederickradius.app/api/place/test-place/enrich${mode ? `?mode=${mode}` : ""}`,
  );
}

describe("place enrichment shared daily budgets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_PLACE_ENRICH_DAILY_CAP", "");
    vi.stubEnv("GOOGLE_PLACE_EXPERIENCE_DAILY_CAP", "");
    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.googlePlacesConfigured.mockReturnValue(true);
    mocks.isOverPaidRequestBudget.mockResolvedValue(false);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: true, count: 1 });
    mocks.parseGoogleHours.mockReturnValue(undefined);
    mocks.mayPublishVisitabilityHours.mockReturnValue(false);
    mocks.getPlaceDetails.mockResolvedValue({
      weekday_hours: [],
      photo_names: [],
      photo_attributions: [],
      business_status: "OPERATIONAL",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reserves the default basic allowance before calling Google", async () => {
    const response = await GET(request(), params);

    expect(response.status).toBe(200);
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "budget_google_place_enrich_basic",
      10,
    );
    expect(mocks.reserveDailyUsage.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getPlaceDetails.mock.invocationCallOrder[0],
    );
    expect(mocks.getPlaceDetails).toHaveBeenCalledWith("ChIJtest", "basic");
  });

  it("checks the Google policy/config hold before rate limits or paid reservations", async () => {
    mocks.googlePlacesConfigured.mockReturnValue(false);

    const response = await GET(request(), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ photos: [], hours: [] });
    expect(mocks.googlePlacesConfigured).toHaveBeenCalledOnce();
    expect(mocks.isOverPaidRequestBudget).not.toHaveBeenCalled();
    expect(mocks.isRateLimited).not.toHaveBeenCalled();
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
    expect(mocks.resolveAndEnrich).not.toHaveBeenCalled();
  });

  it("uses the tighter experience allowance", async () => {
    await GET(request("experience"), params);

    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "budget_google_place_enrich_experience",
      5,
    );
    expect(mocks.getPlaceDetails).toHaveBeenCalledWith(
      "ChIJtest",
      "experience",
    );
  });

  it.each([
    ["GOOGLE_PLACE_ENRICH_DAILY_CAP", "9999", 80],
    ["GOOGLE_PLACE_ENRICH_DAILY_CAP", "not-a-number", 10],
    ["GOOGLE_PLACE_EXPERIENCE_DAILY_CAP", "9999", 20],
    ["GOOGLE_PLACE_EXPERIENCE_DAILY_CAP", "0", 1],
  ] as const)("bounds %s=%s to %i", async (name, configured, expected) => {
    vi.stubEnv(name, configured);

    await GET(
      request(name === "GOOGLE_PLACE_EXPERIENCE_DAILY_CAP" ? "experience" : undefined),
      params,
    );

    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      name === "GOOGLE_PLACE_EXPERIENCE_DAILY_CAP"
        ? "budget_google_place_enrich_experience"
        : "budget_google_place_enrich_basic",
      expected,
    );
  });

  it.each([null, { reserved: false, count: 10 }])(
    "fails closed without a shared reservation (%j)",
    async (reservation) => {
      mocks.reserveDailyUsage.mockResolvedValue(reservation);

      const response = await GET(request(), params);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ photos: [], hours: [] });
      expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
      expect(mocks.resolveAndEnrich).not.toHaveBeenCalled();
    },
  );

  it("fails closed when the shared allowance cannot be checked", async () => {
    mocks.reserveDailyUsage.mockRejectedValue(new Error("database unavailable"));

    const response = await GET(request(), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ photos: [], hours: [] });
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
    expect(mocks.resolveAndEnrich).not.toHaveBeenCalled();
  });

  it("coalesces simultaneous requests before reserving paid usage", async () => {
    let finishLookup!: (value: {
      weekday_hours: never[];
      photo_names: never[];
      photo_attributions: never[];
      business_status: "OPERATIONAL";
    }) => void;
    mocks.getPlaceDetails.mockReturnValue(
      new Promise((resolve) => {
        finishLookup = resolve;
      }),
    );

    const first = GET(request(), params);
    const second = GET(request(), params);

    await vi.waitFor(() => {
      expect(mocks.getPlaceDetails).toHaveBeenCalledOnce();
    });
    expect(mocks.reserveDailyUsage).toHaveBeenCalledOnce();

    finishLookup({
      weekday_hours: [],
      photo_names: [],
      photo_attributions: [],
      business_status: "OPERATIONAL",
    });
    const responses = await Promise.all([first, second]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(mocks.reserveDailyUsage).toHaveBeenCalledOnce();
    expect(mocks.getPlaceDetails).toHaveBeenCalledOnce();
  });

  it("does not reserve for an unknown slug", async () => {
    const response = await GET(request(), {
      params: Promise.resolve({ slug: "missing-place" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });
});
