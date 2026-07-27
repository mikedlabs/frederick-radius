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

import { fuseRankedIds, hybridPlaceSearch } from "./hybrid-search";

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
    expect(sql).toHaveBeenCalledTimes(2);
  });
});
