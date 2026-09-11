import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reserveDailyUsage: vi.fn() }));

vi.mock("@/lib/usage-meter", () => ({
  reserveDailyUsage: mocks.reserveDailyUsage,
}));

import {
  MAX_RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT,
  radiusSearchEmbeddingDailyDocumentLimit,
  radiusSearchSemanticConfigured,
  reserveRadiusSearchEmbeddingDocuments,
} from "./search-index-budget";

const ENV_KEYS = [
  "RADIUS_SEARCH_SEMANTIC_ENABLED",
  "RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT",
  "OPENAI_API_KEY",
] as const;

describe("scheduled Radius semantic-search budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: true, count: 7 });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("defaults invalid allowances to zero and clamps the code maximum", () => {
    expect(radiusSearchEmbeddingDailyDocumentLimit()).toBe(0);
    expect(radiusSearchEmbeddingDailyDocumentLimit("nope")).toBe(0);
    expect(radiusSearchEmbeddingDailyDocumentLimit(" ")).toBe(0);
    expect(radiusSearchEmbeddingDailyDocumentLimit(-1)).toBe(0);
    expect(radiusSearchEmbeddingDailyDocumentLimit(0)).toBe(0);
    expect(radiusSearchEmbeddingDailyDocumentLimit(41)).toBe(41);
    expect(radiusSearchEmbeddingDailyDocumentLimit(99_999)).toBe(
      MAX_RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT,
    );
  });

  it("requires the explicit switch, direct OpenAI key, and positive cap", () => {
    process.env.OPENAI_API_KEY = "test-openai";
    process.env.RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT = "12";
    expect(radiusSearchSemanticConfigured()).toBe(false);

    process.env.RADIUS_SEARCH_SEMANTIC_ENABLED = "1";
    expect(radiusSearchSemanticConfigured()).toBe(true);

    process.env.RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT = "0";
    expect(radiusSearchSemanticConfigured()).toBe(false);
  });

  it("reserves the whole provider batch under one shared Eastern-day cap", async () => {
    process.env.RADIUS_SEARCH_SEMANTIC_ENABLED = "1";
    process.env.RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT = "19";
    process.env.OPENAI_API_KEY = "test-openai";

    await expect(reserveRadiusSearchEmbeddingDocuments(7)).resolves.toEqual({
      reserved: true,
      count: 7,
    });
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "radius_search_embedding",
      19,
      7,
    );
  });

  it("does not touch the shared counter while semantic indexing is off", async () => {
    await expect(reserveRadiusSearchEmbeddingDocuments(7)).resolves.toEqual({
      reserved: false,
      count: 0,
    });
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
  });
});
