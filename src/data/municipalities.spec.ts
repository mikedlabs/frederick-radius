import { describe, expect, it } from "vitest";
import { isMunicipalitySlug, MUNICIPALITY_BY_SLUG } from "./municipalities";

describe("municipality slug lookup", () => {
  it("accepts catalog slugs and rejects inherited object properties", () => {
    expect(isMunicipalitySlug("frederick")).toBe(true);
    expect(isMunicipalitySlug("constructor")).toBe(false);
    expect(isMunicipalitySlug("__proto__")).toBe(false);
    expect(isMunicipalitySlug("toString")).toBe(false);
    expect(Object.getPrototypeOf(MUNICIPALITY_BY_SLUG)).toBeNull();
  });
});
