import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  embed: vi.fn(),
  embeddingModel: vi.fn(),
  getSql: vi.fn(),
  runtimeEmbeddingsConfigured: vi.fn(),
  reserveAskEmbeddingCall: vi.fn(),
}));

vi.mock("ai", () => ({
  embed: mocks.embed,
}));
vi.mock("@ai-sdk/openai", () => ({
  openai: {
    embedding: mocks.embeddingModel,
  },
}));
vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));
vi.mock("@/lib/ask/runtime-budget", () => ({
  askRuntimeEmbeddingsConfigured: mocks.runtimeEmbeddingsConfigured,
  reserveAskEmbeddingCall: mocks.reserveAskEmbeddingCall,
}));

import {
  fuseRankedIds,
  hybridPlaceSearch,
  SEMANTIC_SQL_TIMEOUT_MS,
} from "./hybrid-search";

function queryText(strings: TemplateStringsArray): string {
  return Array.from(strings).join(" ");
}

const exact = {
  source_id: "exact",
  content: "Exact coffee result",
  metadata: { name: "Exact" },
  score: 0.8,
};

function sqlWith({
  keyword = [exact],
  semantic = [],
}: {
  keyword?: Array<typeof exact>;
  semantic?: Array<typeof exact>;
} = {}) {
  return vi.fn((strings: TemplateStringsArray) =>
    Promise.resolve(
      queryText(strings).includes("ts_rank_cd")
        ? keyword
        : semantic,
    ),
  );
}

describe("hybrid Radius retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.RADIUS_HYBRID_SEARCH;
    delete process.env.RADIUS_EMBEDDING_MODEL;
    mocks.runtimeEmbeddingsConfigured.mockImplementation(() =>
      Boolean(process.env.OPENAI_API_KEY),
    );
    mocks.reserveAskEmbeddingCall.mockResolvedValue({ reserved: true, count: 1 });
    mocks.embeddingModel.mockReturnValue({ provider: "openai" });
    mocks.embed.mockResolvedValue({
      embedding: Array(1536).fill(0.01),
    });
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.RADIUS_HYBRID_SEARCH;
    delete process.env.RADIUS_EMBEDDING_MODEL;
  });

  it("rewards a place supported by both exact and semantic retrieval", () => {
    expect(fuseRankedIds(["exact-only", "both"], ["both", "semantic-only"], 3)[0]).toBe("both");
  });

  it("keeps exact retrieval slightly stronger when lists disagree", () => {
    expect(fuseRankedIds(["exact"], ["semantic"], 2)).toEqual(["exact", "semantic"]);
  });

  it("deduplicates the fused result", () => {
    expect(fuseRankedIds(["a", "a", "b"], ["a", "c"], 10)).toEqual(expect.arrayContaining(["a", "b", "c"]));
    expect(new Set(fuseRankedIds(["a", "a"], ["a"], 10)).size).toBe(1);
  });

  it("always returns database FTS results without an OpenAI key", async () => {
    const sql = sqlWith();
    mocks.getSql.mockReturnValue(sql);

    await expect(hybridPlaceSearch("coffee")).resolves.toMatchObject([
      { sourceId: "exact", content: "Exact coffee result" },
    ]);
    expect(sql).toHaveBeenCalledTimes(1);
    expect(mocks.embeddingModel).not.toHaveBeenCalled();
    expect(mocks.embed).not.toHaveBeenCalled();
  });

  it("falls back to FTS when the optional embedding request fails", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const sql = sqlWith();
    mocks.getSql.mockReturnValue(sql);
    mocks.embed.mockRejectedValue(new Error("provider unavailable"));

    await expect(hybridPlaceSearch("coffee")).resolves.toMatchObject([
      { sourceId: "exact" },
    ]);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("keeps FTS without calling OpenAI when the shared reservation is unavailable", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const sql = sqlWith();
    mocks.getSql.mockReturnValue(sql);
    mocks.reserveAskEmbeddingCall.mockResolvedValue(null);

    await expect(hybridPlaceSearch("coffee")).resolves.toMatchObject([
      { sourceId: "exact" },
    ]);
    expect(mocks.reserveAskEmbeddingCall).toHaveBeenCalledOnce();
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("keeps FTS results when the semantic database query fails", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const sql = vi.fn((strings: TemplateStringsArray) => {
      if (queryText(strings).includes("ts_rank_cd")) {
        return Promise.resolve([exact]);
      }
      return Promise.reject(new Error("vector query unavailable"));
    });
    mocks.getSql.mockReturnValue(sql);

    await expect(hybridPlaceSearch("coffee")).resolves.toMatchObject([
      { sourceId: "exact" },
    ]);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("returns FTS on a hung semantic query and consumes a late rejection", async () => {
    vi.useFakeTimers();
    try {
      process.env.OPENAI_API_KEY = "test-openai-key";
      let rejectSemantic!: (error: Error) => void;
      const cancel = vi.fn();
      const semanticQuery = Object.assign(
        new Promise<Array<typeof exact>>((_, reject) => {
          rejectSemantic = reject;
        }),
        { cancel },
      );
      const sql = vi.fn((strings: TemplateStringsArray) =>
        queryText(strings).includes("ts_rank_cd")
          ? Promise.resolve([exact])
          : semanticQuery,
      );
      mocks.getSql.mockReturnValue(sql);

      const pending = hybridPlaceSearch("coffee and bikes");
      await vi.advanceTimersByTimeAsync(0);
      expect(sql).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(SEMANTIC_SQL_TIMEOUT_MS);
      await expect(pending).resolves.toMatchObject([
        { sourceId: "exact" },
      ]);
      expect(cancel).toHaveBeenCalledOnce();

      // postgres-js rejects a cancelled query after the deadline has already
      // returned the FTS rows. This must remain handled.
      rejectSemantic(new Error("cancelled after deadline"));
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps FTS results when the provider returns an incompatible vector", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const sql = sqlWith();
    mocks.getSql.mockReturnValue(sql);
    mocks.embed.mockResolvedValue({ embedding: [0.1, 0.2] });

    await expect(hybridPlaceSearch("coffee")).resolves.toMatchObject([
      { sourceId: "exact" },
    ]);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("adds semantic matches when direct OpenAI embeddings are available", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const semantic = {
      source_id: "semantic",
      content: "Bicycles and espresso",
      metadata: { name: "Semantic" },
      score: 0.9,
    };
    const sql = sqlWith({ semantic: [semantic] });
    mocks.getSql.mockReturnValue(sql);

    const result = await hybridPlaceSearch("coffee and bikes");

    expect(result.map((row) => row.sourceId)).toEqual([
      "exact",
      "semantic",
    ]);
    expect(mocks.embeddingModel).toHaveBeenCalledWith(
      "text-embedding-3-small",
    );
    expect(mocks.reserveAskEmbeddingCall.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.embed.mock.invocationCallOrder[0],
    );
    expect(mocks.embed).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0 }),
    );
    expect(sql).toHaveBeenCalledTimes(2);
  });
});
