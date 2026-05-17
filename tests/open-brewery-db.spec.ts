import { describe, it, expect } from "vitest";
import {
  normalizeBrewery,
  fetchFrederickBreweries,
  type ObdbRaw,
} from "@/lib/integrations/openBreweryDb";

const base: ObdbRaw = {
  id: "obdb-1",
  name: "Attaboy Beer",
  brewery_type: "micro",
  address_1: "400 Sagner Ave",
  city: "Frederick",
  state_province: "Maryland",
  postal_code: "21701",
  country: "United States",
  latitude: "39.4123",
  longitude: "-77.4105",
  phone: "3015551234",
  website_url: "https://attaboybeer.com",
};

describe("normalizeBrewery", () => {
  it("normalizes a real Frederick County brewery", () => {
    const b = normalizeBrewery(base)!;
    expect(b).toMatchObject({
      externalId: "obdb-1",
      name: "Attaboy Beer",
      municipality: "frederick",
      state: "MD",
      source: "openbrewerydb",
      dedupeKey: "attaboybeer",
    });
    expect(b.geom).toEqual({ lat: 39.4123, lng: -77.4105 });
  });

  it("rejects non-Maryland rows", () => {
    expect(normalizeBrewery({ ...base, state_province: "Virginia" })).toBeNull();
  });

  it("rejects closed/planning breweries (operational honesty)", () => {
    expect(normalizeBrewery({ ...base, brewery_type: "closed" })).toBeNull();
    expect(normalizeBrewery({ ...base, brewery_type: "planning" })).toBeNull();
  });

  it("rejects a Maryland city that is not a Frederick County municipality (no fabricated muni)", () => {
    expect(normalizeBrewery({ ...base, city: "Baltimore" })).toBeNull();
  });

  it("maps city aliases to the canonical municipality slug", () => {
    expect(normalizeBrewery({ ...base, city: "Mt Airy" })!.municipality).toBe("mount-airy");
    expect(normalizeBrewery({ ...base, city: "Mount Airy" })!.municipality).toBe("mount-airy");
  });

  it("rejects missing or out-of-county coordinates", () => {
    expect(normalizeBrewery({ ...base, latitude: null, longitude: null })).toBeNull();
    expect(normalizeBrewery({ ...base, latitude: "0", longitude: "0" })).toBeNull();
    expect(normalizeBrewery({ ...base, latitude: 38.9, longitude: -77.04 })).toBeNull(); // DC
  });

  it("accepts numeric or string coordinates", () => {
    const b = normalizeBrewery({ ...base, latitude: 39.41, longitude: -77.41 })!;
    expect(b.geom).toEqual({ lat: 39.41, lng: -77.41 });
  });

  it("rejects rows missing an id or name", () => {
    expect(normalizeBrewery({ ...base, id: "" })).toBeNull();
    expect(normalizeBrewery({ ...base, name: "  " })).toBeNull();
  });
});

describe("fetchFrederickBreweries — off by default", () => {
  it("returns [] and makes no network call unless RADIUS_OBDB=1", async () => {
    delete process.env.RADIUS_OBDB;
    await expect(fetchFrederickBreweries()).resolves.toEqual([]);
  });
});
