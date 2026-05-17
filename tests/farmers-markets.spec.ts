import { describe, it, expect } from "vitest";
import { isFarmersMarket } from "@/lib/farmersMarkets";

describe("isFarmersMarket", () => {
  it("accepts genuine farmers/farm markets", () => {
    for (const n of [
      "North Market Farmers Market",
      "Thurmont Main Street Farmers Market",
      "Emmitsburg Farmers Market",
      "Martin's Farm Market",
      "Rolling Green Farm Market",
      "Myersville Farmers Market (Year-round)",
    ]) {
      expect(isFarmersMarket(n)).toBe(true);
    }
  });

  it("rejects grocery chains and unrelated 'market' names", () => {
    for (const n of [
      "Weis Markets",
      "Giant Food",
      "Common Market Co-op",
      "Lighthouse Seafood",
      "Trout's Market",
      "Aldi",
      "South Mountain Creamery",
      "Dollar General",
    ]) {
      expect(isFarmersMarket(n)).toBe(false);
    }
  });

  it("handles empty / junk", () => {
    expect(isFarmersMarket("")).toBe(false);
    expect(isFarmersMarket("Hardware Store")).toBe(false);
  });
});
