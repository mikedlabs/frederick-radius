import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Kept in its own file because these tests need module mocks (the database
 * handle and the place catalog), while tripwires.spec.ts exercises the pure
 * anomaly helpers against the real module. Mixing the two would force the
 * pure tests to run under mocks they never asked for.
 *
 * The semantic-index tripwire exists because hybridPlaceSearch() fails soft
 * to [] by contract, which makes an EMPTY index look identical to a healthy
 * one. These lock the two ways this watchdog could itself fail: crying wolf
 * when the feature is deliberately off, and staying quiet when the index is
 * genuinely dead.
 */

const mockSql = vi.hoisted(() => ({ current: null as unknown }));
const mockPlaces = vi.hoisted(() => ({ count: 1000 }));

vi.mock("@/lib/db/client", () => ({
  getSql: () => mockSql.current,
}));
vi.mock("@/lib/loaders/places", () => ({
  publicPlaces: () => Array.from({ length: mockPlaces.count }, (_, i) => ({ slug: `p${i}` })),
}));

// Static import: vi.mock calls above are hoisted, so the mocks are already in
// place. Importing once here also avoids paying the module's heavy integration
// imports inside the first test's timeout budget.
import { semanticIndexTripwire } from "./tripwires";

/** A postgres-js style tagged-template stub returning one canned row. */
function sqlReturning(row: { total: number; embedded: number }) {
  return () => Promise.resolve([row]);
}

describe("semanticIndexTripwire", () => {
  const ORIGINAL = process.env.RADIUS_HYBRID_SEARCH;
  const ORIGINAL_OPENAI = process.env.OPENAI_API_KEY;
  const ORIGINAL_SEMANTIC = process.env.RADIUS_SEARCH_SEMANTIC_ENABLED;
  const ORIGINAL_LIMIT =
    process.env.RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT;

  beforeEach(() => {
    mockPlaces.count = 1000;
    delete process.env.RADIUS_HYBRID_SEARCH;
    delete process.env.OPENAI_API_KEY;
    delete process.env.RADIUS_SEARCH_SEMANTIC_ENABLED;
    delete process.env.RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT;
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.RADIUS_HYBRID_SEARCH;
    else process.env.RADIUS_HYBRID_SEARCH = ORIGINAL;
    if (ORIGINAL_OPENAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_OPENAI;
    if (ORIGINAL_SEMANTIC === undefined) {
      delete process.env.RADIUS_SEARCH_SEMANTIC_ENABLED;
    } else process.env.RADIUS_SEARCH_SEMANTIC_ENABLED = ORIGINAL_SEMANTIC;
    if (ORIGINAL_LIMIT === undefined) {
      delete process.env.RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT;
    } else {
      process.env.RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT =
        ORIGINAL_LIMIT;
    }
  });

  it("stays silent when there is no database (fail-soft contract)", async () => {
    mockSql.current = null;
    expect(await semanticIndexTripwire()).toEqual([]);
  });

  it("stays silent when hybrid search is switched off on purpose", async () => {
    process.env.RADIUS_HYBRID_SEARCH = "0";
    mockSql.current = sqlReturning({ total: 0, embedded: 0 });
    expect(await semanticIndexTripwire()).toEqual([]);
  });

  it("goes red when the searchable index is empty", async () => {
    mockSql.current = sqlReturning({ total: 0, embedded: 0 });
    const out = await semanticIndexTripwire();
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("index_empty");
    expect(out[0].source).toBe("semantic-search");
    // The operator must be told the exact command that fixes it.
    expect(out[0].detail).toContain("build:radius-search");
  });

  it("goes red when the index has fallen well behind the catalog", async () => {
    mockSql.current = sqlReturning({ total: 500, embedded: 0 }); // 50% of 1000
    const out = await semanticIndexTripwire();
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("index_stale");
  });

  it("stays green with healthy FTS coverage and no OpenAI key", async () => {
    mockSql.current = sqlReturning({ total: 980, embedded: 0 }); // vectors optional
    expect(await semanticIndexTripwire()).toEqual([]);
  });

  it("does not infer a vector-backfill expectation from an OpenAI key", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    mockSql.current = sqlReturning({ total: 980, embedded: 100 });
    expect(await semanticIndexTripwire()).toEqual([]);
  });

  it("reports a stalled optional vector backfill only when explicitly configured", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.RADIUS_SEARCH_SEMANTIC_ENABLED = "1";
    process.env.RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT = "100";
    mockSql.current = sqlReturning({ total: 980, embedded: 100 });
    const out = await semanticIndexTripwire();
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("embedding_stale");
  });

  it("stays green when configured vector coverage is healthy", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.RADIUS_SEARCH_SEMANTIC_ENABLED = "1";
    process.env.RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT = "100";
    mockSql.current = sqlReturning({ total: 980, embedded: 900 });
    expect(await semanticIndexTripwire()).toEqual([]);
  });

  it("stays silent when the table is missing rather than reporting a false failure", async () => {
    mockSql.current = () => Promise.reject(new Error('relation "radius_search_documents" does not exist'));
    expect(await semanticIndexTripwire()).toEqual([]);
  });
});
