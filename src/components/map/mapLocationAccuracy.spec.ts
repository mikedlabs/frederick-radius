import { describe, expect, it } from "vitest";
import { clampLocationAccuracy } from "./mapLocationAccuracy";

describe("map location accuracy", () => {
  it("keeps a normal browser reading exact", () => {
    expect(clampLocationAccuracy(42)).toBe(42);
  });

  it("clamps false precision and unusably broad readings", () => {
    expect(clampLocationAccuracy(1.4)).toBe(12);
    expect(clampLocationAccuracy(4_500)).toBe(1_000);
  });

  it("rejects missing or invalid readings", () => {
    expect(clampLocationAccuracy(null)).toBeNull();
    expect(clampLocationAccuracy(Number.NaN)).toBeNull();
    expect(clampLocationAccuracy(0)).toBeNull();
  });
});
