import { describe, it, expect } from "vitest";
import { easternOffsetIso, breadcrumbJsonLd, itemListJsonLd } from "./jsonld";

describe("easternOffsetIso", () => {
  it("re-expresses a UTC instant in Eastern wall time with offset (EDT)", () => {
    expect(easternOffsetIso("2026-06-11T21:00:00.000Z")).toBe("2026-06-11T17:00:00-04:00");
  });
  it("uses the winter offset across DST (EST)", () => {
    expect(easternOffsetIso("2026-01-15T22:00:00.000Z")).toBe("2026-01-15T17:00:00-05:00");
  });
  it("returns undefined for missing/garbage input", () => {
    expect(easternOffsetIso(null)).toBeUndefined();
    expect(easternOffsetIso("nope")).toBeUndefined();
  });
});

describe("builders", () => {
  it("breadcrumbJsonLd positions items 1-based with absolute URLs", () => {
    const b = breadcrumbJsonLd([
      { name: "Places", path: "/places" },
      { name: "Brunswick", path: "/m/brunswick" },
    ]);
    expect(b.itemListElement[1]).toMatchObject({ position: 2, name: "Brunswick" });
    expect(String(b.itemListElement[0].item)).toMatch(/^https?:\/\/.+\/places$/);
  });
  it("itemListJsonLd carries the count", () => {
    expect(itemListJsonLd("x", [{ name: "a", path: "/a" }]).numberOfItems).toBe(1);
  });
});
