import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  radiusSearchCronBatch: vi.fn(),
  refreshRadiusSearchIndex: vi.fn(),
}));

vi.mock("@/lib/ask/search-index-builder", () => {
  class RadiusSearchRefreshError extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "RadiusSearchRefreshError";
    }
  }
  return {
    RadiusSearchRefreshError,
    radiusSearchCronBatch: mocks.radiusSearchCronBatch,
    refreshRadiusSearchIndex: mocks.refreshRadiusSearchIndex,
  };
});

import { GET } from "./route";

function request(secret = "test-cron-secret") {
  return new Request(
    "https://frederickradius.app/api/cron/radius-search",
    { headers: { authorization: `Bearer ${secret}` } },
  );
}

describe("GET /api/cron/radius-search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.RADIUS_SEARCH_CRON = "1";
    mocks.radiusSearchCronBatch.mockReturnValue(256);
    mocks.refreshRadiusSearchIndex.mockResolvedValue({
      total: 1634,
      changed: 1634,
      processed: 256,
      remaining: 1378,
      tokenUsage: 2000,
      current: false,
    });
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.RADIUS_SEARCH_CRON;
    delete process.env.RADIUS_SEARCH_CRON_BATCH;
  });

  it("stays off without the explicit paid-work flag", async () => {
    delete process.env.RADIUS_SEARCH_CRON;

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.enabled).toBe(false);
    expect(mocks.refreshRadiusSearchIndex).not.toHaveBeenCalled();
  });

  it("runs one bounded, resumable index slice", async () => {
    process.env.RADIUS_SEARCH_CRON_BATCH = "256";

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      enabled: true,
      healthy: true,
      batch_limit: 256,
      processed: 256,
      remaining: 1378,
      current: false,
    });
    expect(mocks.radiusSearchCronBatch).toHaveBeenCalledWith("256");
    expect(mocks.refreshRadiusSearchIndex).toHaveBeenCalledWith({
      maxDocuments: 256,
    });
  });

  it("rejects an invalid cron bearer token", async () => {
    const response = await GET(request("wrong-secret"));

    expect(response.status).toBe(401);
    expect(mocks.refreshRadiusSearchIndex).not.toHaveBeenCalled();
  });
});
