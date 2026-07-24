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

  beforeEach(() => {
    mockPlaces.count = 1000;
    delete process.env.RADIUS_HYBRID_SEARCH;
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.RADIUS_HYBRID_SEARCH;
    else process.env.RADIUS_HYBRID_SEARCH = ORIGINAL;
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

  it("goes red when the index is empty — the shipped-but-dead case", async () => {
    mockSql.current = sqlReturning({ total: 0, embedded: 0 });
    const out = await semanticIndexTripwire();
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("index_empty");
    expect(out[0].source).toBe("semantic-search");
    // The operator must be told the exact command that fixes it.
    expect(out[0].detail).toContain("build:radius-search");
  });

  it("goes red when the index has fallen well behind the catalog", async () => {
    mockSql.current = sqlReturning({ total: 500, embedded: 500 }); // 50% of 1000
    const out = await semanticIndexTripwire();
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("index_stale");
  });

  it("stays green when coverage is healthy", async () => {
    mockSql.current = sqlReturning({ total: 980, embedded: 980 }); // 98%
    expect(await semanticIndexTripwire()).toEqual([]);
  });

  it("stays silent when the table is missing rather than reporting a false failure", async () => {
    mockSql.current = () => Promise.reject(new Error('relation "radius_search_documents" does not exist'));
    expect(await semanticIndexTripwire()).toEqual([]);
  });
});
