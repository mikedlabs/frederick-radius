import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GettingThere from "./GettingThere";

describe("GettingThere", () => {
  it("prints a venue note's checked date as written, not the evening before", () => {
    const html = renderToStaticMarkup(
      createElement(GettingThere, {
        geom: { lng: -77.4108, lat: 39.4128 },
        venuePlaceSlug: "black-hog-bbq-bar",
        geoPrecise: false,
        parkingDecision: null,
      }),
    );
    expect(html).toContain("No dedicated lot.");
    expect(html).toContain("Checked Jun 15, 2026");
    expect(html).not.toContain("Jun 14, 2026");
  });

  it("renders nothing without a note, a garage or a station", () => {
    const html = renderToStaticMarkup(
      createElement(GettingThere, {
        geom: { lng: -77.4127594, lat: 39.6213 },
        venuePlaceSlug: "thurmont-community-park-thurmont",
        geoPrecise: false,
        parkingDecision: null,
      }),
    );
    expect(html).toBe("");
  });
});
