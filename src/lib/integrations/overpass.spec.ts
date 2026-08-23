import { describe, expect, it, vi } from "vitest";
import {
  fetchOsmFrederickOutcome,
  mapTagToCategory,
} from "@/lib/integrations/overpass";

describe("OpenStreetMap public-utility classification", () => {
  it("never treats an ornamental fountain as drinking water", () => {
    expect(mapTagToCategory({ amenity: "fountain" })).toBeNull();
  });

  it("accepts a fountain only when potable water is explicit", () => {
    expect(mapTagToCategory({ amenity: "fountain", drinking_water: "yes" })).toEqual({
      category_slug: "water",
      osm_tag: "amenity=fountain",
    });
  });

  it("does not present a natural spring as a verified drinking fixture", () => {
    expect(mapTagToCategory({ amenity: "drinking_water", natural: "spring" })).toBeNull();
  });

  it("keeps dog-waste baskets out of the generic trash layer", () => {
    expect(mapTagToCategory({ amenity: "waste_basket", waste: "dog_excrement" })).toEqual({
      category_slug: "dog-waste",
      osm_tag: "amenity=waste_basket,waste=dog_excrement",
    });
  });
});

describe("OpenStreetMap endpoint resilience", () => {
  it("gives each fallback endpoint a fresh timeout signal", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        elements: [{
          id: 42,
          type: "node",
          lat: 39.414,
          lon: -77.41,
          tags: { amenity: "toilets" },
        }],
      }), { status: 200 }));

    const outcome = await fetchOsmFrederickOutcome({
      fetchImpl: fetchMock as unknown as typeof fetch,
      endpoints: ["https://slow.example", "https://healthy.example"],
      endpointTimeoutMs: 100,
    });

    expect(outcome).toMatchObject({
      availability: "current",
      attemptedEndpoints: 2,
      places: [{
        osm_id: "node/42",
        name: "Public restroom",
        category_slug: "restroom",
      }],
    });
    const firstSignal = fetchMock.mock.calls[0]?.[1]?.signal;
    const secondSignal = fetchMock.mock.calls[1]?.[1]?.signal;
    expect(firstSignal).toBeInstanceOf(AbortSignal);
    expect(secondSignal).toBeInstanceOf(AbortSignal);
    expect(secondSignal).not.toBe(firstSignal);
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      "User-Agent": expect.stringContaining("FrederickRadius"),
    });
  });

  it("keeps a valid empty response distinct from an outage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ elements: [] }), { status: 200 }),
    );

    const outcome = await fetchOsmFrederickOutcome({
      fetchImpl: fetchMock as unknown as typeof fetch,
      endpoints: ["https://empty-one.example", "https://empty-two.example"],
      endpointTimeoutMs: 100,
    });

    expect(outcome).toEqual({
      places: [],
      availability: "empty",
      attemptedEndpoints: 2,
    });
  });

  it("labels total endpoint failure as unavailable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));

    const outcome = await fetchOsmFrederickOutcome({
      fetchImpl: fetchMock as unknown as typeof fetch,
      endpoints: ["https://down-one.example", "https://down-two.example"],
      endpointTimeoutMs: 100,
    });

    expect(outcome).toEqual({
      places: [],
      availability: "unavailable",
      attemptedEndpoints: 2,
    });
  });
});
