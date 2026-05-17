import { describe, it, expect } from "vitest";
import { bucketOf, BUCKET_COLOR } from "@/components/map/categoryMarkers";

describe("bucketOf — consumer categories no longer collapse", () => {
  it("drink/food categories get their own distinct bucket (the 'all look the same' fix)", () => {
    expect(bucketOf("brewery")).toBe("brewery");
    expect(bucketOf("bar")).toBe("bar");
    expect(bucketOf("coffee")).toBe("coffee");
    expect(bucketOf("bakery")).toBe("bakery");
    expect(bucketOf("winery")).toBe("wine");
    // none of them fall back into the generic fork
    for (const s of ["brewery", "bar", "coffee", "bakery", "winery"]) {
      expect(bucketOf(s)).not.toBe("food");
    }
  });

  it("live music is split off from the arts frame", () => {
    expect(bucketOf("music")).toBe("music");
    expect(bucketOf("music")).not.toBe("arts");
  });

  it("genuinely-generic food still reads as food", () => {
    expect(bucketOf("restaurant")).toBe("food");
    expect(bucketOf("pizza")).toBe("food");
    expect(bucketOf("food-truck")).toBe("food");
    expect(bucketOf("food")).toBe("food");
  });

  it("other arts children still read as arts", () => {
    expect(bucketOf("museum")).toBe("arts");
    expect(bucketOf("gallery")).toBe("arts");
    expect(bucketOf("theater")).toBe("arts");
  });

  it("unknown slugs fall back to the neutral pin", () => {
    expect(bucketOf("totally-made-up-xyz")).toBe("pin");
  });

  it("every bucket has a distinct-enough cluster color defined", () => {
    for (const b of ["brewery", "wine", "bar", "coffee", "bakery", "music"] as const) {
      expect(BUCKET_COLOR[b]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    // the six new ones are not all the same swatch
    const swatches = new Set(
      (["brewery", "wine", "bar", "coffee", "bakery", "music"] as const).map((b) => BUCKET_COLOR[b]),
    );
    expect(swatches.size).toBeGreaterThanOrEqual(5);
  });
});
