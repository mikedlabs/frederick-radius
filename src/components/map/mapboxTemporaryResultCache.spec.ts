import { describe, expect, it } from "vitest";
import {
  MAPBOX_TEMPORARY_RESULT_CACHE_LIMIT,
  MAPBOX_TEMPORARY_RESULT_TTL_MS,
  readTemporaryMapboxResult,
  writeTemporaryMapboxResult,
  type TemporaryMapboxResultCache,
} from "./mapboxTemporaryResultCache";

const result = (name: string) => ({
  name,
  coordinates: { lng: -77.41, lat: 39.414 },
  attribution: "Map data © Mapbox",
});

describe("temporary Mapbox result cache", () => {
  it("reopens a fresh retrieved result without durable storage", () => {
    const cache: TemporaryMapboxResultCache = new Map();
    writeTemporaryMapboxResult(cache, "place.1", result("Place one"), 1_000);

    expect(readTemporaryMapboxResult(cache, "place.1", 1_001)).toEqual(
      result("Place one"),
    );
  });

  it("expires temporary provider data after five minutes", () => {
    const cache: TemporaryMapboxResultCache = new Map();
    writeTemporaryMapboxResult(cache, "place.1", result("Place one"), 1_000);

    expect(
      readTemporaryMapboxResult(
        cache,
        "place.1",
        1_000 + MAPBOX_TEMPORARY_RESULT_TTL_MS,
      ),
    ).toBeNull();
    expect(cache.size).toBe(0);
  });

  it("evicts the least recently used result at the hard bound", () => {
    const cache: TemporaryMapboxResultCache = new Map();
    for (let index = 0; index < MAPBOX_TEMPORARY_RESULT_CACHE_LIMIT; index += 1) {
      writeTemporaryMapboxResult(
        cache,
        `place.${index}`,
        result(`Place ${index}`),
        1_000 + index,
      );
    }
    expect(readTemporaryMapboxResult(cache, "place.0", 2_000)).not.toBeNull();

    writeTemporaryMapboxResult(cache, "place.new", result("New"), 2_001);

    expect(cache.size).toBe(MAPBOX_TEMPORARY_RESULT_CACHE_LIMIT);
    expect(cache.has("place.0")).toBe(true);
    expect(cache.has("place.1")).toBe(false);
  });
});
