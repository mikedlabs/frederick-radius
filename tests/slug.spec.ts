import { describe, it, expect } from "vitest";
import { cutAtWordBoundary } from "@/lib/slug";

describe("cutAtWordBoundary", () => {
  it("leaves short strings untouched", () => {
    expect(cutAtWordBoundary("first-friday", 60)).toBe("first-friday");
    expect(cutAtWordBoundary("abc", 3)).toBe("abc");
  });

  it("never cuts a word in half (the reported bug)", () => {
    // The exact failure mode: a hard slice(0,40) produced
    // "live-summer-concert-series-the-soul-truth-wit".
    const full = "summer-concert-series-the-soul-truth-within-us";
    const cut = cutAtWordBoundary(full, 40);
    expect(cut).toBe("summer-concert-series-the-soul-truth");
    expect(full.startsWith(cut)).toBe(true);
    expect(cut.endsWith("-")).toBe(false);
    // not a partial token
    expect(full.split("-")).toContain(cut.split("-").pop());
  });

  it("strips a trailing hyphen left exactly at the cut", () => {
    expect(cutAtWordBoundary("alpha-beta-gamma", 6)).toBe("alpha");
  });

  it("hard-cuts a single oversized token rather than returning empty", () => {
    const r = cutAtWordBoundary("supercalifragilisticexpialidocious", 10);
    expect(r).toBe("supercalif");
    expect(r.length).toBe(10);
  });

  it("is deterministic and idempotent", () => {
    const a = cutAtWordBoundary("one-two-three-four-five-six-seven", 20);
    expect(cutAtWordBoundary(a, 20)).toBe(a);
  });

  it("handles an empty string", () => {
    expect(cutAtWordBoundary("", 40)).toBe("");
  });
});
