import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FoodTruckJourneys, { modeForFoodTruckHash } from "./FoodTruckJourneys";

describe("FoodTruckJourneys", () => {
  it("presents three clear journeys and renders only the primary panel", () => {
    const html = renderToStaticMarkup(
      createElement(FoodTruckJourneys, {
        nearby: createElement("p", null, "Nearby panel"),
        week: createElement("p", null, "Week panel"),
        trucks: createElement("p", null, "Truck panel"),
        defaultMode: "week",
      }),
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain("Near me");
    expect(html).toContain("This week");
    expect(html).toContain("Trucks");
    expect(html).toContain('id="food-truck-panel-week"');
    expect(html).toContain('id="food-truck-panel-near"');
    expect(html).toMatch(/id="food-truck-panel-near"[^>]*hidden/);
    expect(html).not.toMatch(/id="food-truck-panel-week"[^>]*hidden/);
  });

  it("preserves existing schedule and vendor deep links", () => {
    expect(modeForFoodTruckHash("#this-week")).toBe("week");
    expect(modeForFoodTruckHash("#vendors")).toBe("trucks");
    expect(modeForFoodTruckHash("#truck-in10se-bbq")).toBe("trucks");
    expect(modeForFoodTruckHash("#near-me")).toBe("near");
    expect(modeForFoodTruckHash("#unknown", "near")).toBe("near");
  });
});
