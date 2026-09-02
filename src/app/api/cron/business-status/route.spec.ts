import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canonicalBusinessStatusRefreshCandidates: vi.fn(),
  decoratePlace: vi.fn(),
  getPlaceDetails: vi.fn(),
  googlePlacesConfigured: vi.fn(),
  googleStatusToOperational: vi.fn(),
  finalizeIdempotentDailyUsage: vi.fn(),
  reserveIdempotentDailyUsage: vi.fn(),
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
  finalizeIdempotentDailyUsage: mocks.finalizeIdempotentDailyUsage,
  reserveIdempotentDailyUsage: mocks.reserveIdempotentDailyUsage,
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
    mocks.reserveIdempotentDailyUsage.mockResolvedValue({
      reserved: true,
      count: 1,
      duplicate: false,
    });
    mocks.finalizeIdempotentDailyUsage.mockResolvedValue({
      finalized: true,
      state: "succeeded",
    });
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
    expect(mocks.reserveIdempotentDailyUsage).toHaveBeenCalledWith(
      "budget_google_business_status",
      40,
      "ChIJCanonicalCafe123",
    );
    expect(
      mocks.reserveIdempotentDailyUsage.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.getPlaceDetails.mock.invocationCallOrder[0]);
    expect(mocks.finalizeIdempotentDailyUsage).toHaveBeenCalledWith(
      "budget_google_business_status",
      "ChIJCanonicalCafe123",
      "succeeded",
    );
    expect(body).toMatchObject({
      healthy: true,
      catalog: 1,
      checked: 1,
      alreadyClaimed: 0,
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
    mocks.reserveIdempotentDailyUsage.mockResolvedValue({
      reserved: false,
      count: 40,
      duplicate: false,
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      healthy: false,
      catalog: 1,
      checked: 0,
      alreadyClaimed: 0,
      budgetExhausted: true,
      usageMeterUnavailable: false,
      mismatches: [],
    });
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("returns an unhealthy 503 when the shared counter is unavailable", async () => {
    mocks.canonicalBusinessStatusRefreshCandidates.mockReturnValue([
      place("meter-unavailable", "ChIJStatusMeterUnavailable123"),
    ]);
    mocks.reserveIdempotentDailyUsage.mockResolvedValue(null);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      enabled: true,
      healthy: false,
      catalog: 1,
      checked: 0,
      alreadyClaimed: 0,
      budgetExhausted: false,
      usageMeterUnavailable: true,
      mismatches: [],
    });
    expect(body.error).toContain("usage counter is unavailable");
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("reuses a completed same-target/day outcome without buying the call again", async () => {
    mocks.canonicalBusinessStatusRefreshCandidates.mockReturnValue([
      place("already-claimed", "ChIJStatusAlreadyClaimed123"),
    ]);
    mocks.reserveIdempotentDailyUsage.mockResolvedValue({
      reserved: false,
      count: 1,
      duplicate: true,
      duplicateState: "succeeded",
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      healthy: true,
      catalog: 1,
      checked: 0,
      alreadyClaimed: 1,
      alreadyCompleted: 1,
      providerFailures: 0,
      budgetExhausted: false,
      usageMeterUnavailable: false,
      mismatches: [],
    });
    expect(mocks.reserveIdempotentDailyUsage).toHaveBeenCalledWith(
      "budget_google_business_status",
      40,
      "ChIJStatusAlreadyClaimed123",
    );
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("reports a null provider result as unhealthy without counting it checked", async () => {
    mocks.canonicalBusinessStatusRefreshCandidates.mockReturnValue([
      place("provider-null", "ChIJStatusProviderNull123"),
    ]);
    mocks.getPlaceDetails.mockResolvedValue(null);
    mocks.finalizeIdempotentDailyUsage.mockResolvedValue({
      finalized: true,
      state: "failed",
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      healthy: false,
      checked: 0,
      providerFailures: 1,
      claimStateFailures: 0,
      failures: ["provider-null"],
    });
    expect(mocks.finalizeIdempotentDailyUsage).toHaveBeenCalledWith(
      "budget_google_business_status",
      "ChIJStatusProviderNull123",
      "failed",
    );
  });

  it("does not repurchase an earlier failed or uncertain daily claim", async () => {
    mocks.canonicalBusinessStatusRefreshCandidates.mockReturnValue([
      place("previous-failure", "ChIJStatusPreviousFailure123"),
    ]);
    mocks.reserveIdempotentDailyUsage.mockResolvedValue({
      reserved: false,
      count: 1,
      duplicate: true,
      duplicateState: "failed",
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      healthy: false,
      checked: 0,
      alreadyClaimed: 1,
      alreadyCompleted: 0,
      providerFailures: 1,
      failures: ["previous-failure"],
    });
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
    expect(mocks.finalizeIdempotentDailyUsage).not.toHaveBeenCalled();
  });

  it("reports a thrown provider request and keeps its paid claim closed", async () => {
    mocks.canonicalBusinessStatusRefreshCandidates.mockReturnValue([
      place("provider-error", "ChIJStatusProviderError123"),
    ]);
    mocks.getPlaceDetails.mockRejectedValue(new Error("timeout"));
    mocks.finalizeIdempotentDailyUsage.mockResolvedValue({
      finalized: true,
      state: "failed",
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      healthy: false,
      checked: 0,
      providerFailures: 1,
    });
    expect(mocks.finalizeIdempotentDailyUsage).toHaveBeenCalledWith(
      "budget_google_business_status",
      "ChIJStatusProviderError123",
      "failed",
    );
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
