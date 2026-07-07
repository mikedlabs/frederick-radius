import { describe, it, expect } from "vitest";
import { normalizeOvertureFeature, findNewCandidates, type OvertureCandidate } from "./candidates";
import type { DedupeRecord } from "@/lib/dedupe";

// A Brunswick point (Frederick County) and a far-away DC point.
const BRUNSWICK: [number, number] = [-77.6289, 39.3143];
const DC: [number, number] = [-77.0369, 38.9072];

function feature(over: Record<string, unknown> = {}, coords = BRUNSWICK) {
  return {
    geometry: { type: "Point", coordinates: coords },
    properties: {
      id: "gers-1",
      names: { primary: "Beans in the Belfry" },
      categories: { primary: "cafe" },
      addresses: [{ freeform: "122 W Potomac St, Brunswick" }],
      sources: [{ dataset: "OpenStreetMap" }, { dataset: "meta" }],
      ...over,
    },
  };
}

describe("normalizeOvertureFeature", () => {
  it("maps a county feature with name/category/address/sources", () => {
    const c = normalizeOvertureFeature(feature())!;
    expect(c.name).toBe("Beans in the Belfry");
    expect(c.category).toBe("cafe");
    expect(c.address).toBe("122 W Potomac St, Brunswick");
    expect(c.sources).toBe("OpenStreetMap, meta");
    expect(c.id).toBe("gers-1");
  });

  it("drops features with no name", () => {
    expect(normalizeOvertureFeature(feature({ names: {}, "@name": undefined, name: undefined }))).toBeNull();
  });

  it("drops features outside the Frederick County ring", () => {
    expect(normalizeOvertureFeature(feature({}, DC))).toBeNull();
  });

  it("drops features with no usable coordinate", () => {
    const f = { geometry: { type: "Point", coordinates: [] }, properties: { names: { primary: "X" } } };
    expect(normalizeOvertureFeature(f)).toBeNull();
  });
});

describe("findNewCandidates", () => {
  const cand = (id: string, name: string, lng: number, lat: number): OvertureCandidate =>
    ({ id, name, lng, lat });

  it("drops candidates that match a curated place (same place, near coords)", () => {
    const curated: DedupeRecord[] = [
      { slug: "beans-in-the-belfry", name: "Beans in the Belfry", geom: { lng: BRUNSWICK[0], lat: BRUNSWICK[1] } },
    ];
    const out = findNewCandidates([cand("g1", "Beans in the Belfry", BRUNSWICK[0], BRUNSWICK[1])], curated);
    expect(out).toHaveLength(0);
  });

  it("keeps genuinely new places", () => {
    const curated: DedupeRecord[] = [
      { slug: "x", name: "Somewhere Else", geom: { lng: -77.41, lat: 39.41 } },
    ];
    const out = findNewCandidates([cand("g2", "New Brunswick Bakery", BRUNSWICK[0], BRUNSWICK[1])], curated);
    expect(out.map((c) => c.id)).toEqual(["g2"]);
  });

  it("self-dedupes two Overture copies of the same POI", () => {
    const dup1 = cand("g3", "Smoketown Brewing Station", BRUNSWICK[0], BRUNSWICK[1]);
    const dup2 = cand("g4", "Smoketown Brewing Station", BRUNSWICK[0] + 0.0001, BRUNSWICK[1]);
    const out = findNewCandidates([dup1, dup2], []);
    expect(out).toHaveLength(1);
  });
});
