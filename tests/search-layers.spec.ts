import { describe, it, expect } from "vitest";
import { searchIndex } from "@/lib/search/index";

/**
 * One-search: typing what a map LAYER shows offers the layer itself, so
 * "farmers market" surfaces the overlay alongside the market places.
 * This is what lets the single map search answer layers, not just text.
 */
describe("searchIndex map-layer results", () => {
  it("offers the markets overlay for a farmers-market query", () => {
    const results = searchIndex("farmers market", 8);
    const layer = results.find((r) => r.id === "layer:markets");
    expect(layer, "expected a layer:markets result").toBeTruthy();
    expect(layer!.href).toBe("/map?mode=browse&layers=markets");
    expect(layer!.type).toBe("action");
  });

  it("offers covered bridges and public art for their keywords", () => {
    expect(searchIndex("covered bridge", 8).some((r) => r.id === "layer:bridges")).toBe(true);
    expect(searchIndex("mural", 8).some((r) => r.id === "layer:art")).toBe(true);
  });

  it("does not offer a layer for an unrelated query", () => {
    const results = searchIndex("pizza", 8);
    expect(results.some((r) => r.id.startsWith("layer:"))).toBe(false);
  });

  it("never offers a coming-soon (not ready) layer", () => {
    // Trails is not ready (federal NPS data); typing its keyword must
    // not toggle an empty overlay.
    const results = searchIndex("appalachian trail", 8);
    expect(results.some((r) => r.id === "layer:trails")).toBe(false);
  });
});
