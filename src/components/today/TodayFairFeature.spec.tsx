import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TODAY_FAIR_PROMOTION_HREF } from "@/lib/today/fair-promotion";

import TodayFairFeature from "./TodayFairFeature";

describe("TodayFairFeature", () => {
  it("makes the planning workspace the single photographic action", () => {
    const html = renderToStaticMarkup(
      createElement(TodayFairFeature, { phase: "planning" }),
    );

    expect(html).toContain("Your Fair Day planner is ready.");
    expect(html).toContain("tickets, parking, transit");
    expect(html).toContain("Plan your Fair day");
    expect(html).toContain(`href="${TODAY_FAIR_PROMOTION_HREF}"`);
    expect(html).toContain("fairgrounds-night-mike-d-960.jpg");
    expect(html).toContain("fairgrounds-night-mike-d-1920.jpg");
    expect(html).toContain('alt=""');
    expect(html).toContain("Photo: Mike D");
    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html).not.toContain(String.fromCharCode(8212));
  });

  it("changes to useful same-day language once the Fair opens", () => {
    const html = renderToStaticMarkup(
      createElement(TodayFairFeature, { phase: "fair-day" }),
    );

    expect(html).toContain("Make today at the Fair easier.");
    expect(html).toContain("Through Sep 26");
    expect(html).toContain("find food and rides");
    expect(html).toContain("Open Fair Day");
  });
});
