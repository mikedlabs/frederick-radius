import { describe, expect, it } from "vitest";
import { categoryRouteOverride } from "./categories";

describe("category route overrides", () => {
  it.each([
    ["public-art", "/map?mode=browse&layers=art"],
    ["sports", "/events?intent=sports"],
    ["community", "/events?intent=community"],
    ["hardware", "/category/services"],
    ["food-truck", "/food-trucks"],
    ["voting", "/contacts"],
  ])("routes %s to a surface with usable content", (slug, destination) => {
    expect(categoryRouteOverride(slug)).toBe(destination);
  });

  it("keeps populated place categories as directories", () => {
    expect(categoryRouteOverride("restaurant")).toBeUndefined();
  });
});
