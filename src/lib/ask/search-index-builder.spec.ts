import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  embedMany: vi.fn(),
  getSql: vi.fn(),
  decoratePlace: vi.fn(),
  publicPlaces: vi.fn(),
}));

vi.mock("ai", () => ({
  embedMany: mocks.embedMany,
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
  existing: Array<{ source_id: string; content_hash: string }> = [],
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
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    mocks.decoratePlace.mockImplementation((place) => place);
    mocks.publicPlaces.mockReturnValue(places);
    mocks.embedMany.mockImplementation(
      async ({ values }: { values: string[] }) => ({
        embeddings: values.map(() => Array(1536).fill(0.01)),
        usage: { tokens: values.length * 10 },
      }),
    );
  });

  afterEach(() => {
    delete process.env.AI_GATEWAY_API_KEY;
  });

  it("bounds the hosted batch configuration", () => {
    expect(radiusSearchCronBatch(undefined)).toBe(256);
    expect(radiusSearchCronBatch("0")).toBe(1);
    expect(radiusSearchCronBatch("34")).toBe(34);
    expect(radiusSearchCronBatch("9999")).toBe(512);
  });

  it("skips unchanged content and advances only the bounded slice", async () => {
    const unchanged = buildRadiusSearchDocument(places[0] as never);
    const sql = sqlWith([
      { source_id: unchanged.id, content_hash: unchanged.contentHash },
    ]);
    mocks.getSql.mockReturnValue(sql);

    const result = await refreshRadiusSearchIndex({ maxDocuments: 1 });

    expect(result).toEqual({
      total: 3,
      changed: 2,
      processed: 1,
      remaining: 1,
      tokenUsage: 10,
      current: false,
    });
    expect(mocks.embedMany).toHaveBeenCalledTimes(1);
    const insertCall = sql.mock.calls.find(([strings]) =>
      queryText(strings).includes(
        "insert into public.radius_search_documents",
      ),
    );
    expect(insertCall?.[1]).toEqual(["bravo"]);
  });

  it("checks storage before making a paid embedding call", async () => {
    const sql = vi
      .fn()
      .mockRejectedValueOnce(new Error("relation does not exist"));
    mocks.getSql.mockReturnValue(sql);

    await expect(refreshRadiusSearchIndex()).rejects.toMatchObject({
      code: "storage_unavailable",
    });
    expect(mocks.embedMany).not.toHaveBeenCalled();
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
    ).toBe(false);
  });
});
