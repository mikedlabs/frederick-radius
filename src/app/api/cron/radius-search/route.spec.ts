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

import { RadiusSearchRefreshError } from "@/lib/ask/search-index-builder";
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
      embedded: 0,
      tokenUsage: 2000,
      embeddingEnabled: true,
      embeddingRemaining: 1634,
      embeddingCurrent: false,
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
      degraded: false,
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

  it("keeps the required index healthy when optional embeddings are degraded", async () => {
    mocks.refreshRadiusSearchIndex.mockResolvedValue({
      total: 1634,
      changed: 0,
      processed: 0,
      remaining: 0,
      embedded: 0,
      tokenUsage: 0,
      embeddingEnabled: true,
      embeddingRemaining: 1634,
      embeddingCurrent: false,
      current: true,
      embeddingWarning: {
        code: "provider_unavailable",
        message:
          "Full-text search was updated. Optional semantic vectors will retry after the embedding provider recovers.",
      },
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      enabled: true,
      healthy: true,
      degraded: true,
      current: true,
      embeddingCurrent: false,
      note:
        "The full-text place index is current. Optional semantic recall will retry automatically.",
    });
  });

  it("reports a healthy semantic backfill without calling it current", async () => {
    mocks.refreshRadiusSearchIndex.mockResolvedValue({
      total: 1634,
      changed: 0,
      processed: 0,
      remaining: 0,
      embedded: 256,
      tokenUsage: 2000,
      embeddingEnabled: true,
      embeddingRemaining: 1378,
      embeddingCurrent: false,
      current: true,
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      healthy: true,
      degraded: false,
      current: true,
      embeddingCurrent: false,
      note:
        "The full-text place index is current. 1378 optional semantic vectors remain.",
    });
  });

  it("treats an overlapping refresh as a healthy skip", async () => {
    mocks.refreshRadiusSearchIndex.mockRejectedValue(
      new RadiusSearchRefreshError(
        "refresh_in_progress",
        "Another Radius search refresh is already running.",
      ),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      enabled: true,
      healthy: true,
      skipped: true,
    });
  });

  it("does not promise an automatic retry for an invalid vector setup", async () => {
    mocks.refreshRadiusSearchIndex.mockResolvedValue({
      total: 1634,
      changed: 0,
      processed: 0,
      remaining: 0,
      embedded: 0,
      tokenUsage: 0,
      embeddingEnabled: true,
      embeddingRemaining: 1634,
      embeddingCurrent: false,
      current: true,
      embeddingWarning: {
        code: "invalid_configuration",
        message: "The embedding model is incompatible.",
      },
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.note).toContain("needs a configuration review");
    expect(body.note).not.toContain("retry automatically");
  });

  it("rejects an invalid cron bearer token", async () => {
    const response = await GET(request("wrong-secret"));

    expect(response.status).toBe(401);
    expect(mocks.refreshRadiusSearchIndex).not.toHaveBeenCalled();
  });
});
