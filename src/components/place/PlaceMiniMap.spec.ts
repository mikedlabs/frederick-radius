import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import PlaceMiniMap from "./PlaceMiniMap";

describe("PlaceMiniMap", () => {
  const originalSwitch = process.env.MAPBOX_STATIC_MAPS_ENABLED;
  const originalCap = process.env.MAPBOX_STATIC_DAILY_REQUEST_CAP;
  const originalToken = process.env.MAPBOX_SERVER_TOKEN;

  afterEach(() => {
    if (originalSwitch === undefined) delete process.env.MAPBOX_STATIC_MAPS_ENABLED;
    else process.env.MAPBOX_STATIC_MAPS_ENABLED = originalSwitch;
    if (originalCap === undefined) delete process.env.MAPBOX_STATIC_DAILY_REQUEST_CAP;
    else process.env.MAPBOX_STATIC_DAILY_REQUEST_CAP = originalCap;
    if (originalToken === undefined) delete process.env.MAPBOX_SERVER_TOKEN;
    else process.env.MAPBOX_SERVER_TOKEN = originalToken;
  });

  function renderLocator() {
    return renderToStaticMarkup(
      createElement(PlaceMiniMap, {
        lng: -77.40837,
        lat: 39.41279,
        name: "Carroll Creek Linear Park",
        color: "#315A43",
      }),
    );
  }

  it("renders a polished local-only locator when Static Images are off", () => {
    process.env.MAPBOX_STATIC_MAPS_ENABLED = "0";
    process.env.MAPBOX_STATIC_DAILY_REQUEST_CAP = "500";
    // Other map features may legitimately configure the shared server token;
    // the dedicated Static Images switch must still prevent this request.
    process.env.MAPBOX_SERVER_TOKEN = "pk.test-server-token";

    const html = renderLocator();

    expect(html).toContain('data-local-locator="true"');
    expect(html).toContain("Radius locator");
    expect(html).toContain("Position only");
    expect(html).toContain("39.4128° N · 77.4084° W");
    expect(html).toContain("/map?c=-77.40837,39.41279,15.5");
    expect(html).not.toContain("/api/static-map");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('rel="prefetch"');
  });

  it("keeps the local-only locator when the paid cap is zero", () => {
    process.env.MAPBOX_STATIC_MAPS_ENABLED = "1";
    process.env.MAPBOX_STATIC_DAILY_REQUEST_CAP = "0";
    process.env.MAPBOX_SERVER_TOKEN = "pk.test-server-token";

    const html = renderLocator();

    expect(html).toContain('data-local-locator="true"');
    expect(html).not.toContain("/api/static-map");
    expect(html).not.toContain("<img");
  });

  it("uses the compact static-map image only when the paid path is ready", () => {
    process.env.MAPBOX_STATIC_MAPS_ENABLED = "1";
    process.env.MAPBOX_STATIC_DAILY_REQUEST_CAP = "25";
    process.env.MAPBOX_SERVER_TOKEN = "pk.test-server-token";

    const html = renderLocator();
    expect(html).toContain("size=320x150");
    expect(html).toContain("lng=-77.4084&amp;lat=39.4128");
    expect(html).toContain("/map?c=-77.40837,39.41279,15.5");
    expect(html).toContain('width="640"');
    expect(html).toContain('height="300"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain("Map preview unavailable. Open the live map.");
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('rel="prefetch"');
  });
});
