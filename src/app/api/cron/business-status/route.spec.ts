import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canonicalBusinessStatusRefreshCandidates: vi.fn(),
  decoratePlace: vi.fn(),
  getPlaceDetails: vi.fn(),
  googlePlacesConfigured: vi.fn(),
  googleStatusToOperational: vi.fn(),
  reserveDailyUsage: vi.fn(),
}));

vi.mock("@/lib/loaders/places", () => ({
  canonicalBusinessStatusRefreshCandidates:
    mocks.canonicalBusinessStatusRefreshCandidates,
  decoratePlace: mocks.decoratePlace,
}));
vi.mock("@/lib/integrations/google-places", () => ({
  getPlaceDetails: mocks.getPlaceDetails,
  googlePlacesConfigured: mocks.googlePlacesConfigured,
  googleStatusToOperational: mocks.googleStatusToOperational,
}));
vi.mock("@/lib/usage-meter", () => ({
  reserveDailyUsage: mocks.reserveDailyUsage,
}));

import { GET } from "./route";

function request() {
  return new Request("https://frederickradius.app/api/cron/business-status", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

function place(
  slug: string,
  googlePlaceId: string,
  isOperational = "operational",
) {
  return {
    slug,
    name: slug,
    google_place_id: googlePlaceId,
    geom: { lng: -77.4105, lat: 39.4143 },
    is_operational: isOperational,
  };
}

describe("GET /api/cron/business-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.BUSINESS_STATUS_CRON = "1";
    mocks.googlePlacesConfigured.mockReturnValue(true);
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: true, count: 1 });
    mocks.decoratePlace.mockImplementation((value) => value);
    mocks.googleStatusToOperational.mockImplementation((status: string) =>
      status === "CLOSED_PERMANENTLY"
        ? "closed_permanently"
        : status === "CLOSED_TEMPORARILY"
          ? "closed_temporarily"
          : status === "OPERATIONAL"
            ? "operational"
            : "needs_verification",
    );
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.BUSINESS_STATUS_CRON;
  });

  it("checks the canonical public provider identity", async () => {
    mocks.canonicalBusinessStatusRefreshCandidates.mockReturnValue([
      place(
        "canonical-cafe",
        "5ba71092-6783-4abd-abc9-3af18d0a401f",
      ),
    ]);
    mocks.decoratePlace.mockImplementation((value) => ({
      ...value,
      google_place_id: "ChIJCanonicalCafe123",
    }));
    mocks.getPlaceDetails.mockResolvedValue({
      business_status: "CLOSED_PERMANENTLY",
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(
      mocks.canonicalBusinessStatusRefreshCandidates,
    ).toHaveBeenCalledTimes(1);
    expect(mocks.decoratePlace).toHaveBeenCalledTimes(1);
    expect(mocks.getPlaceDetails).toHaveBeenCalledWith(
      "ChIJCanonicalCafe123",
      "status",
    );
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "budget_google_business_status",
      40,
    );
    expect(mocks.reserveDailyUsage.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getPlaceDetails.mock.invocationCallOrder[0],
    );
    expect(body).toMatchObject({
      catalog: 1,
      checked: 1,
      budgetExhausted: false,
      mismatches: [
        {
          slug: "canonical-cafe",
          current: "operational",
          google: "closed_permanently",
        },
      ],
    });
  });

  it("stops before Google when the shared allowance is exhausted", async () => {
    mocks.canonicalBusinessStatusRefreshCandidates.mockReturnValue([
      place("daily-cap", "ChIJDailyStatusCap123"),
    ]);
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: false, count: 40 });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      catalog: 1,
      checked: 0,
      budgetExhausted: true,
      mismatches: [],
    });
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("fails before a paid call when two public slugs share a provider identity", async () => {
    mocks.canonicalBusinessStatusRefreshCandidates.mockReturnValue([
      place("duplicate-b", "ChIJSharedStatus123"),
      place("duplicate-a", "ChIJSharedStatus123"),
    ]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      enabled: true,
      healthy: false,
      catalog: 2,
    });
    expect(body.error).toContain(
      "ChIJSharedStatus123: duplicate-a, duplicate-b",
    );
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("ignores records without a valid public provider identity", async () => {
    mocks.canonicalBusinessStatusRefreshCandidates.mockReturnValue([
      place(
        "partner-only",
        "5ba71092-6783-4abd-abc9-3af18d0a401f",
      ),
    ]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      catalog: 0,
      checked: 0,
      mismatches: [],
    });
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });
});
