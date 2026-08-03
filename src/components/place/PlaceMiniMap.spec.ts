import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PlaceMiniMap from "./PlaceMiniMap";

describe("PlaceMiniMap", () => {
  it("uses the compact static-map image and does not speculate the full map route", () => {
    const html = renderToStaticMarkup(
      createElement(PlaceMiniMap, {
        lng: -77.40837,
        lat: 39.41279,
        name: "Carroll Creek Linear Park",
        color: "#315A43",
      }),
    );

    expect(html).toContain("size=320x150");
    expect(html).toContain("lng=-77.4084&amp;lat=39.4128");
    expect(html).toContain("/map?c=-77.40837,39.41279,15.5");
    expect(html).toContain('width="640"');
    expect(html).toContain('height="300"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).not.toContain('rel="prefetch"');
  });
});
