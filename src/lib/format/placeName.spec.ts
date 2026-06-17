import { describe, it, expect } from "vitest";
import { normalizePlaceName, normalizeCity } from "./placeName";

describe("normalizePlaceName", () => {
  it("strips Google branch-id numbers on chain-type names", () => {
    expect(normalizePlaceName("Pnc Bank 8")).toBe("PNC Bank");
    expect(normalizePlaceName("Cvs Pharmacy 95")).toBe("CVS Pharmacy");
    expect(normalizePlaceName("City Hall 8")).toBe("City Hall");
    expect(normalizePlaceName("Post Office 4")).toBe("Post Office");
  });

  it("never strips a meaningful trailing number", () => {
    expect(normalizePlaceName("Hwy 15")).toBe("Hwy 15");
    expect(normalizePlaceName("Route 40 Diner")).toBe("Route 40 Diner");
    expect(normalizePlaceName("Studio 54")).toBe("Studio 54");
  });

  it("camel-cases Mc surnames", () => {
    expect(normalizePlaceName("Mcclintock Distillery")).toBe("McClintock Distillery");
    expect(normalizePlaceName("Alice Mccormick Acupuncture")).toBe("Alice McCormick Acupuncture");
    expect(normalizePlaceName("Mccurdy Field")).toBe("McCurdy Field");
  });

  it("does not touch Mac- words", () => {
    expect(normalizePlaceName("Machine Shop")).toBe("Machine Shop");
  });

  it("upper-cases known acronyms only", () => {
    expect(normalizePlaceName("Vr")).toBe("VR");
    expect(normalizePlaceName("Studio Twenty")).toBe("Studio Twenty"); // not an acronym
  });

  it("never invents apostrophes (left for curated overrides)", () => {
    // "Roros" stays as-is; we don't guess "Roro's".
    expect(normalizePlaceName("Roros Mexican Grill")).toBe("Roros Mexican Grill");
  });

  it("is idempotent", () => {
    const once = normalizePlaceName("Pnc Bank 8");
    expect(normalizePlaceName(once)).toBe(once);
  });
});

describe("normalizeCity", () => {
  it("folds the editorial 'Downtown Frederick' pseudo-city to the postal city", () => {
    expect(normalizeCity("Downtown Frederick")).toBe("Frederick");
    expect(normalizeCity("downtown frederick")).toBe("Frederick");
    expect(normalizeCity("  Downtown   Frederick ")).toBe("Frederick");
  });

  it("leaves real cities untouched", () => {
    expect(normalizeCity("Frederick")).toBe("Frederick");
    expect(normalizeCity("Thurmont")).toBe("Thurmont");
    expect(normalizeCity("Mount Airy")).toBe("Mount Airy");
    expect(normalizeCity("")).toBe("");
  });

  it("is idempotent", () => {
    expect(normalizeCity(normalizeCity("Downtown Frederick"))).toBe("Frederick");
  });
});
