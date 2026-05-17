import { describe, it, expect } from "vitest";
import { isNonDiscoverable, NON_DISCOVERABLE_TYPES } from "@/lib/relevance";

describe("isNonDiscoverable", () => {
  it("hides the B2B / professional-services long tail the scrape pulled in", () => {
    expect(isNonDiscoverable("general_contractor")).toBe(true);
    expect(isNonDiscoverable("insurance_agency")).toBe(true);
    expect(isNonDiscoverable("real_estate_agency")).toBe(true);
    expect(isNonDiscoverable("lawyer")).toBe(true);
    expect(isNonDiscoverable("accounting")).toBe(true);
    expect(isNonDiscoverable("consultant")).toBe(true);
    expect(isNonDiscoverable("finance")).toBe(true);
  });

  it("hides trades, freight, and residential buildings", () => {
    expect(isNonDiscoverable("plumber")).toBe(true);
    expect(isNonDiscoverable("electrician")).toBe(true);
    expect(isNonDiscoverable("roofing_contractor")).toBe(true);
    expect(isNonDiscoverable("wholesaler")).toBe(true);
    expect(isNonDiscoverable("moving_company")).toBe(true);
    expect(isNonDiscoverable("apartment_complex")).toBe(true);
    expect(isNonDiscoverable("condominium_complex")).toBe(true);
  });

  it("KEEPS real destinations people actually look for", () => {
    expect(isNonDiscoverable("coffee_shop")).toBe(false);
    expect(isNonDiscoverable("restaurant")).toBe(false);
    expect(isNonDiscoverable("museum")).toBe(false);
    expect(isNonDiscoverable("park")).toBe(false);
    expect(isNonDiscoverable("church")).toBe(false);
    expect(isNonDiscoverable("brewery")).toBe(false);
    expect(isNonDiscoverable("art_gallery")).toBe(false);
    // Google types distilleries / breweries / roasters as "manufacturer"
    // — these are destinations, never hidden. McClintock, Tenth Ward, …
    expect(isNonDiscoverable("manufacturer")).toBe(false);
    // Medical / wellness are things residents do search for.
    expect(isNonDiscoverable("medical_clinic")).toBe(false);
    expect(isNonDiscoverable("dentist")).toBe(false);
    expect(isNonDiscoverable("hair_salon")).toBe(false);
    // Civic / community orgs stay.
    expect(isNonDiscoverable("non_profit_organization")).toBe(false);
    expect(isNonDiscoverable("local_government_office")).toBe(false);
  });

  it("KEEPS vague or missing types — never guess a place away", () => {
    expect(isNonDiscoverable("service")).toBe(false); // 142 of these — too vague
    expect(isNonDiscoverable("store")).toBe(false);
    expect(isNonDiscoverable("premise")).toBe(false);
    expect(isNonDiscoverable("point_of_interest")).toBe(false);
    expect(isNonDiscoverable("")).toBe(false);
    expect(isNonDiscoverable(undefined)).toBe(false);
    expect(isNonDiscoverable(null)).toBe(false);
  });

  it("is case / whitespace tolerant", () => {
    expect(isNonDiscoverable("  General_Contractor ")).toBe(true);
    expect(isNonDiscoverable("LAWYER")).toBe(true);
  });

  it("the hide set is non-trivial but bounded (no accidental over-broadening)", () => {
    expect(NON_DISCOVERABLE_TYPES.size).toBeGreaterThan(20);
    expect(NON_DISCOVERABLE_TYPES.size).toBeLessThan(40);
  });
});
