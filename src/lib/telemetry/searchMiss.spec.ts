import { describe, it, expect } from "vitest";
import { normalizeQueryKey } from "./searchMiss";

describe("normalizeQueryKey", () => {
  it("folds case, punctuation, and spacing so repeats group", () => {
    expect(normalizeQueryKey("Dog-friendly patios!")).toBe("dog friendly patios");
    expect(normalizeQueryKey("  DOG   friendly   patios ")).toBe("dog friendly patios");
  });

  it("drops a leading article", () => {
    expect(normalizeQueryKey("the pool")).toBe("pool");
    expect(normalizeQueryKey("a splash pad")).toBe("splash pad");
  });

  it("keeps digits and distinct words distinct", () => {
    expect(normalizeQueryKey("route 15 diner")).toBe("route 15 diner");
    expect(normalizeQueryKey("pho")).toBe("pho");
  });

  it("returns empty for punctuation-only input", () => {
    expect(normalizeQueryKey("!!!")).toBe("");
    expect(normalizeQueryKey("   ")).toBe("");
  });
});
