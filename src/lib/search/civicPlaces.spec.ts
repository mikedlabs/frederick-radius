import { describe, it, expect } from "vitest";
import { matchCivicPlaces } from "./civicPlaces";

describe("matchCivicPlaces — fire companies in search", () => {
  it("finds a company by name and opens the map with the layer revealed", () => {
    const r = matchCivicPlaces("independent hose");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].title).toMatch(/independent hose/i);
    expect(r[0].subtitle).toMatch(/fire & rescue/i);
    expect(r[0].href).toMatch(/^\/map\?at=-?\d+\.\d+,-?\d+\.\d+&show=firestations$/);
    expect(r[0].type).toBe("action");
  });

  it("offers the whole layer for the generic ask", () => {
    for (const q of ["fire station", "fire stations", "firehouse", "fire company"]) {
      const r = matchCivicPlaces(q);
      expect(r, q).toHaveLength(1);
      expect(r[0].href).toBe("/map?show=firestations");
    }
  });

  it("ignores short and unrelated queries", () => {
    expect(matchCivicPlaces("br")).toEqual([]);
    expect(matchCivicPlaces("")).toEqual([]);
    expect(matchCivicPlaces("zzzznotathing")).toEqual([]);
  });

  it("a specific-company result carries coordinates and a civic id", () => {
    const r = matchCivicPlaces("vigilant hose");
    expect(r.length).toBeGreaterThan(0);
    expect(typeof r[0].lat).toBe("number");
    expect(typeof r[0].lng).toBe("number");
    expect(r[0].id).toMatch(/^civic:/);
  });
});
