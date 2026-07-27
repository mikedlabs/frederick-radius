import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  embedMany: vi.fn(),
  embeddingModel: vi.fn(),
  getSql: vi.fn(),
  decoratePlace: vi.fn(),
  publicPlaces: vi.fn(),
}));

vi.mock("ai", () => ({
  embedMany: mocks.embedMany,
}));
vi.mock("@ai-sdk/openai", () => ({
  openai: {
    embedding: mocks.embeddingModel,
  },
}));
vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));
vi.mock("@/lib/loaders/places", () => ({
  decoratePlace: mocks.decoratePlace,
  publicPlaces: mocks.publicPlaces,
}));

import {
  buildRadiusSearchDocument,
  radiusSearchCronBatch,
  refreshRadiusSearchIndex,
} from "./search-index-builder";

const places = [
  {
    slug: "alpha",
    name: "Alpha Coffee",
    category: "Coffee",
    city: "Frederick",
    municipality: "frederick",
    description: "Coffee and bicycle repair.",
  },
  {
    slug: "bravo",
    name: "Bravo Bikes",
    category: "Shopping",
    city: "Frederick",
    municipality: "frederick",
    description: "Bicycles and trail gear.",
  },
  {
    slug: "charlie",
    name: "Charlie Cafe",
    category: "Coffee",
    city: "Brunswick",
    municipality: "brunswick",
    description: "A neighborhood cafe.",
  },
];

function queryText(strings: TemplateStringsArray): string {
  return Array.from(strings).join(" ");
}

function sqlWith(
  existing: Array<{
    source_id: string;
    content_hash: string;
    has_embedding: boolean;
  }> = [],
) {
  return vi.fn(
    (strings: TemplateStringsArray, ..._values: unknown[]) => {
      void _values;
      if (queryText(strings).includes("select source_id")) {
        return Promise.resolve(existing);
      }
      return Promise.resolve([]);
    },
  );
}

describe("Radius search index builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.RADIUS_EMBEDDING_MODEL;
    mocks.decoratePlace.mockImplementation((place) => place);
    mocks.publicPlaces.mockReturnValue(places);
    mocks.embeddingModel.mockReturnValue({ provider: "openai" });
    mocks.embedMany.mockImplementation(
      async ({ values }: { values: string[] }) => ({
        embeddings: values.map(() => Array(1536).fill(0.01)),
        usage: { tokens: values.length * 10 },
      }),
    );
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.RADIUS_EMBEDDING_MODEL;
  });

  it("bounds the hosted batch configuration", () => {
    expect(radiusSearchCronBatch(undefined)).toBe(256);
    expect(radiusSearchCronBatch("0")).toBe(1);
    expect(radiusSearchCronBatch("34")).toBe(34);
    expect(radiusSearchCronBatch("9999")).toBe(512);
  });

  it("indexes changed full-text content without an OpenAI key", async () => {
    const unchanged = buildRadiusSearchDocument(places[0] as never);
    const sql = sqlWith([
      {
        source_id: unchanged.id,
        content_hash: unchanged.contentHash,
        has_embedding: false,
      },
    ]);
    mocks.getSql.mockReturnValue(sql);

    const result = await refreshRadiusSearchIndex({ maxDocuments: 1 });

    expect(result).toEqual({
      total: 3,
      changed: 2,
      processed: 1,
      remaining: 1,
      embedded: 0,
      tokenUsage: 0,
      current: false,
    });
    expect(mocks.embeddingModel).not.toHaveBeenCalled();
    expect(mocks.embedMany).not.toHaveBeenCalled();
    const insertCall = sql.mock.calls.find(([strings]) =>
      queryText(strings).includes(
        "insert into public.radius_search_documents",
      ),
    );
    expect(insertCall?.[1]).toEqual(["bravo"]);
  });

  it("backfills a null embedding even when the content hash is unchanged", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const unchanged = buildRadiusSearchDocument(places[0] as never);
    const sql = sqlWith([
      {
        source_id: unchanged.id,
        content_hash: unchanged.contentHash,
        has_embedding: false,
      },
      {
        source_id: buildRadiusSearchDocument(places[1] as never).id,
        content_hash: buildRadiusSearchDocument(places[1] as never).contentHash,
        has_embedding: true,
      },
      {
        source_id: buildRadiusSearchDocument(places[2] as never).id,
        content_hash: buildRadiusSearchDocument(places[2] as never).contentHash,
        has_embedding: true,
      },
    ]);
    mocks.getSql.mockReturnValue(sql);

    const result = await refreshRadiusSearchIndex();

    expect(result).toMatchObject({
      changed: 1,
      processed: 1,
      remaining: 0,
      embedded: 1,
      tokenUsage: 10,
      current: true,
    });
    expect(mocks.embeddingModel).toHaveBeenCalledWith(
      "text-embedding-3-small",
    );
    expect(mocks.embedMany).toHaveBeenCalledTimes(1);
    expect(
      sql.mock.calls.some(([strings]) =>
        queryText(strings).includes(
          "update public.radius_search_documents as document",
        ),
      ),
    ).toBe(true);
  });

  it("accepts the old Gateway-style model value with the direct provider", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.RADIUS_EMBEDDING_MODEL =
      "openai/text-embedding-3-small";
    const sql = sqlWith();
    mocks.getSql.mockReturnValue(sql);
    mocks.publicPlaces.mockReturnValue([places[0]]);

    await refreshRadiusSearchIndex();

    expect(mocks.embeddingModel).toHaveBeenCalledWith(
      "text-embedding-3-small",
    );
  });

  it("checks storage before making a paid embedding call", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const sql = vi
      .fn()
      .mockRejectedValueOnce(new Error("relation does not exist"));
    mocks.getSql.mockReturnValue(sql);

    await expect(refreshRadiusSearchIndex()).rejects.toMatchObject({
      code: "storage_unavailable",
    });
    expect(mocks.embedMany).not.toHaveBeenCalled();
  });

  it("keeps the full-text write when the optional provider fails", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const sql = sqlWith();
    mocks.getSql.mockReturnValue(sql);
    mocks.publicPlaces.mockReturnValue([places[0]]);
    mocks.embedMany.mockRejectedValue(new Error("provider unavailable"));

    await expect(refreshRadiusSearchIndex()).rejects.toMatchObject({
      code: "embedding_failed",
    });
    expect(
      sql.mock.calls.some(([strings]) =>
        queryText(strings).includes(
          "insert into public.radius_search_documents",
        ),
      ),
    ).toBe(true);
  });

  it("does not clear the index when the canonical catalog is empty", async () => {
    const sql = sqlWith();
    mocks.getSql.mockReturnValue(sql);
    mocks.publicPlaces.mockReturnValue([]);

    await expect(refreshRadiusSearchIndex()).rejects.toMatchObject({
      code: "catalog_empty",
    });
    expect(sql).not.toHaveBeenCalled();
    expect(mocks.embedMany).not.toHaveBeenCalled();
  });

  it("rejects a wrong-dimension model before writing", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const sql = sqlWith();
    mocks.getSql.mockReturnValue(sql);
    mocks.publicPlaces.mockReturnValue([places[0]]);
    mocks.embedMany.mockResolvedValue({
      embeddings: [[0.1, 0.2]],
      usage: { tokens: 2 },
    });

    await expect(refreshRadiusSearchIndex()).rejects.toMatchObject({
      code: "invalid_embedding",
    });
    expect(
      sql.mock.calls.some(([strings]) =>
        queryText(strings).includes(
          "insert into public.radius_search_documents",
        ),
      ),
    ).toBe(true);
    expect(
      sql.mock.calls.some(([strings]) =>
        queryText(strings).includes(
          "update public.radius_search_documents as document",
        ),
      ),
    ).toBe(false);
  });
});
