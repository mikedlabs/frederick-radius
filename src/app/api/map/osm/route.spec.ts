import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchOutcome: vi.fn(),
  dataCache: new Map<string, unknown>(),
}));

vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: () => Promise<unknown>, keyParts: string[]) =>
    async () => {
      const key = keyParts.join(":");
      if (mocks.dataCache.has(key)) return mocks.dataCache.get(key);
      // Match the important Next cache property: rejected work is not stored.
      const value = await fn();
      mocks.dataCache.set(key, value);
      return value;
    },
}));

vi.mock("@/lib/integrations/overpass", () => ({
  fetchOsmFrederickOutcome: mocks.fetchOutcome,
}));

const RESTROOM = {
  osm_id: "node/42",
  name: "Public restroom",
  category_slug: "restroom",
  osm_tag: "amenity=toilets",
  lng: -77.41,
  lat: 39.414,
};

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("GET /api/map/osm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dataCache.clear();
  });

  it("long-caches a non-empty successful refresh without changing the body", async () => {
    mocks.fetchOutcome.mockResolvedValue({
      places: [RESTROOM],
      availability: "current",
      attemptedEndpoints: 1,
    });
    const { GET } = await loadRoute();

    const response = await GET();

    expect(await response.json()).toEqual([RESTROOM]);
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(response.headers.get("x-radius-source-status")).toBe("current");
  });

  it("does not cache an empty refresh as a successful daily result", async () => {
    mocks.fetchOutcome
      .mockResolvedValueOnce({
        places: [],
        availability: "empty",
        attemptedEndpoints: 3,
      })
      .mockResolvedValueOnce({
        places: [RESTROOM],
        availability: "current",
        attemptedEndpoints: 2,
      });
    const { GET } = await loadRoute();

    const empty = await GET();
    const recovered = await GET();

    expect(await empty.json()).toEqual([]);
    expect(empty.headers.get("cache-control")).toContain("no-store");
    expect(empty.headers.get("x-radius-source-status")).toBe("empty");
    expect(await recovered.json()).toEqual([RESTROOM]);
    expect(recovered.headers.get("x-radius-source-status")).toBe("current");
    expect(mocks.fetchOutcome).toHaveBeenCalledTimes(2);
  });

  it("serves the warm last-known-good snapshot after a refresh outage", async () => {
    mocks.fetchOutcome.mockResolvedValueOnce({
      places: [RESTROOM],
      availability: "current",
      attemptedEndpoints: 1,
    });
    const { GET } = await loadRoute();
    const first = await GET();
    expect(await first.json()).toEqual([RESTROOM]);

    // Simulate the durable cache reaching revalidation while this warm
    // instance still holds a previously successful response.
    mocks.dataCache.clear();
    mocks.fetchOutcome.mockResolvedValueOnce({
      places: [],
      availability: "unavailable",
      attemptedEndpoints: 3,
    });
    const stale = await GET();

    expect(await stale.json()).toEqual([RESTROOM]);
    expect(stale.headers.get("x-radius-source-status")).toBe("stale");
    expect(stale.headers.get("cache-control")).toContain("s-maxage=60");
  });

  it("marks an outage unavailable and refuses edge caching without a fallback", async () => {
    mocks.fetchOutcome.mockResolvedValue({
      places: [],
      availability: "unavailable",
      attemptedEndpoints: 3,
    });
    const { GET } = await loadRoute();

    const response = await GET();

    expect(await response.json()).toEqual([]);
    expect(response.headers.get("x-radius-source-status")).toBe("unavailable");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
