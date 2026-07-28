import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FoodTrucksLoading from "@/app/(app)/food-trucks/loading";
import TransitLoading from "@/app/(app)/transit/loading";

function shimmerCount(html: string): number {
  return html.match(/\bshimmer\b/g)?.length ?? 0;
}

describe("data-heavy route loading states", () => {
  it("keeps the food-truck board responsive while its weekly data settles", () => {
    const html = renderToStaticMarkup(createElement(FoodTrucksLoading));

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading food trucks.");
    expect(html).toContain("food-truck-masthead");
    expect(shimmerCount(html)).toBeGreaterThanOrEqual(12);
  });

  it("reserves the live transit map and next-ride hierarchy immediately", () => {
    const html = renderToStaticMarkup(createElement(TransitLoading));

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading transit.");
    expect(html).toContain("clamp(20rem, 44svh, 26rem)");
    expect(shimmerCount(html)).toBeGreaterThanOrEqual(10);
  });
});
