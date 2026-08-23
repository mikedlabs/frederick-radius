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
  EMBEDDING_BATCH_TIMEOUT_MS,
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
    vi.useRealTimers();
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
      embeddingEnabled: false,
      embeddingRemaining: 0,
      embeddingCurrent: true,
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
      changed: 0,
      processed: 0,
      remaining: 0,
      embedded: 1,
      tokenUsage: 10,
      embeddingEnabled: true,
      embeddingRemaining: 0,
      embeddingCurrent: true,
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

  it("commits searchable text before a best-effort cleanup failure", async () => {
    mocks.publicPlaces.mockReturnValue([places[0]]);
    let transactionCount = 0;
    let baselineCommitted = false;
    const cleanupError = Object.assign(
      new Error("sensitive bound content must not be logged"),
      {
        name: "PostgresError",
        code: "57014",
        severity: "ERROR",
        schema_name: "public",
        table_name: "radius_search_documents",
        routine: "ProcessInterrupts",
        detail: "sensitive place document",
      },
    );
    const tx = vi.fn((strings: TemplateStringsArray) => {
      const text = queryText(strings);
      if (text.includes("pg_try_advisory_xact_lock")) {
        return Promise.resolve([{ acquired: true }]);
      }
      if (text.includes("select source_id")) {
        return Promise.resolve([]);
      }
      if (text.includes("delete from public.radius_search_documents")) {
        expect(baselineCommitted).toBe(true);
        return Promise.reject(cleanupError);
      }
      return Promise.resolve([]);
    });
    const sql = Object.assign(vi.fn(), {
      begin: vi.fn(
        async (callback: (transaction: typeof tx) => unknown) => {
          transactionCount += 1;
          const currentTransaction = transactionCount;
          const result = await callback(tx);
          if (currentTransaction === 1) baselineCommitted = true;
          return result;
        },
      ),
    });
    mocks.getSql.mockReturnValue(sql);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await refreshRadiusSearchIndex();

    expect(result).toMatchObject({
      total: 1,
      processed: 1,
      remaining: 0,
      current: true,
      cleanupWarning: {
        code: "retired_documents_cleanup_failed",
      },
    });
    expect(sql.begin).toHaveBeenCalledTimes(2);
    expect(
      tx.mock.calls.some(([strings]) =>
        queryText(strings).includes(
          "insert into public.radius_search_documents",
        ),
      ),
    ).toBe(true);
    expect(
      tx.mock.calls.some(([strings]) =>
        queryText(strings).includes("statement_timeout = '5s'"),
      ),
    ).toBe(true);
    expect(mocks.embedMany).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[radius-search] retired-document cleanup failed after the search baseline committed",
      {
        name: "PostgresError",
        code: "57014",
        severity: "ERROR",
        schema: "public",
        table: "radius_search_documents",
        routine: "ProcessInterrupts",
      },
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      "sensitive bound content",
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      "sensitive place document",
    );
    warn.mockRestore();
  });

  it("binds cleanup ids and cutoff as pooled-database-safe text", async () => {
    mocks.publicPlaces.mockReturnValue([places[0], places[1]]);
    const cleanupBindings: unknown[][] = [];
    let transactionCount = 0;
    const tx = vi.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = queryText(strings);
        if (text.includes("pg_try_advisory_xact_lock")) {
          return Promise.resolve([{ acquired: true }]);
        }
        if (text.includes("select source_id")) {
          return Promise.resolve([]);
        }
        if (text.includes("delete from public.radius_search_documents")) {
          cleanupBindings.push(values);
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      },
    );
    const sql = Object.assign(vi.fn(), {
      begin: vi.fn(
        async (callback: (transaction: typeof tx) => unknown) => {
          transactionCount += 1;
          return callback(tx);
        },
      ),
    });
    mocks.getSql.mockReturnValue(sql);

    const result = await refreshRadiusSearchIndex();

    expect(result.cleanupWarning).toBeUndefined();
    expect(transactionCount).toBe(2);
    expect(cleanupBindings).toHaveLength(1);
    expect(cleanupBindings[0]?.[0]).toBe('["alpha","bravo"]');
    expect(Array.isArray(cleanupBindings[0]?.[0])).toBe(false);
    expect(cleanupBindings[0]?.[1]).toEqual(expect.any(String));
    expect(Number.isFinite(Date.parse(cleanupBindings[0]?.[1] as string))).toBe(
      true,
    );
    expect(cleanupBindings[0]?.[1]).not.toBeInstanceOf(Date);
    expect(
      tx.mock.calls.some(([strings]) =>
        queryText(strings).includes("jsonb_array_elements_text"),
      ),
    ).toBe(true);
  });

  it("skips a concurrent refresh before any storage or paid work", async () => {
    const tx = vi.fn(
      (strings: TemplateStringsArray) =>
        Promise.resolve(
          queryText(strings).includes("pg_try_advisory_xact_lock")
            ? [{ acquired: false }]
            : [],
        ),
    );
    const sql = Object.assign(sqlWith(), {
      begin: vi.fn(
        async (callback: (transaction: typeof tx) => unknown) =>
          callback(tx),
      ),
    });
    mocks.getSql.mockReturnValue(sql);

    await expect(refreshRadiusSearchIndex()).rejects.toMatchObject({
      code: "refresh_in_progress",
    });
    expect(mocks.embedMany).not.toHaveBeenCalled();
    expect(
      tx.mock.calls.some(([strings]) =>
        queryText(strings).includes("statement_timeout"),
      ),
    ).toBe(true);
  });

  it("finishes every full-text batch when the optional provider fails", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const sql = sqlWith();
    mocks.getSql.mockReturnValue(sql);
    mocks.publicPlaces.mockReturnValue(
      Array.from({ length: 70 }, (_, index) => ({
        ...places[0],
        slug: `place-${index}`,
        name: `Place ${index}`,
      })),
    );
    mocks.embedMany.mockRejectedValue(new Error("provider unavailable"));

    const result = await refreshRadiusSearchIndex();

    expect(result).toMatchObject({
      changed: 70,
      processed: 70,
      remaining: 0,
      embedded: 0,
      embeddingEnabled: true,
      embeddingRemaining: 70,
      embeddingCurrent: false,
      current: true,
      embeddingWarning: {
        code: "provider_unavailable",
      },
    });
    expect(
      sql.mock.calls.filter(([strings]) =>
        queryText(strings).includes(
          "insert into public.radius_search_documents",
        ),
      ),
    ).toHaveLength(2);
    const finalInsertOrder = sql.mock.invocationCallOrder.filter(
      (_, index) =>
        queryText(
          sql.mock.calls[index]?.[0] as unknown as TemplateStringsArray,
        ).includes("insert into public.radius_search_documents"),
    );
    expect(Math.max(...finalInsertOrder)).toBeLessThan(
      mocks.embedMany.mock.invocationCallOrder[0],
    );
  });

  it("times out a hanging optional provider and returns a degraded full-text result", async () => {
    vi.useFakeTimers();
    process.env.OPENAI_API_KEY = "test-openai-key";
    const sql = sqlWith();
    mocks.getSql.mockReturnValue(sql);
    mocks.publicPlaces.mockReturnValue([places[0]]);
    mocks.embedMany.mockImplementation(() => new Promise(() => undefined));

    const pending = refreshRadiusSearchIndex();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.embedMany).toHaveBeenCalledOnce();
    const call = mocks.embedMany.mock.calls[0][0] as {
      abortSignal: AbortSignal;
    };

    await vi.advanceTimersByTimeAsync(EMBEDDING_BATCH_TIMEOUT_MS);
    const result = await pending;

    expect(call.abortSignal.aborted).toBe(true);
    expect(result).toMatchObject({
      current: true,
      processed: 1,
      embedded: 0,
      embeddingRemaining: 1,
      embeddingCurrent: false,
      embeddingWarning: {
        code: "provider_unavailable",
      },
    });
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

  it("keeps full-text search healthy when a model returns wrong dimensions", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const sql = sqlWith();
    mocks.getSql.mockReturnValue(sql);
    mocks.publicPlaces.mockReturnValue([places[0]]);
    mocks.embedMany.mockResolvedValue({
      embeddings: [[0.1, 0.2]],
      usage: { tokens: 2 },
    });

    const result = await refreshRadiusSearchIndex();

    expect(result).toMatchObject({
      current: true,
      embedded: 0,
      embeddingRemaining: 1,
      embeddingCurrent: false,
      tokenUsage: 2,
      embeddingWarning: {
        code: "invalid_dimensions",
      },
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

  it("does not make a paid call for a model that would mix vector spaces", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.RADIUS_EMBEDDING_MODEL = "text-embedding-3-large";
    const sql = sqlWith();
    mocks.getSql.mockReturnValue(sql);
    mocks.publicPlaces.mockReturnValue([places[0]]);

    const result = await refreshRadiusSearchIndex();

    expect(result).toMatchObject({
      current: true,
      embedded: 0,
      embeddingRemaining: 1,
      embeddingCurrent: false,
      embeddingWarning: {
        code: "invalid_configuration",
      },
    });
    expect(mocks.embedMany).not.toHaveBeenCalled();
  });
});
