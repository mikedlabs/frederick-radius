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

  function renderLocator(props: Partial<Parameters<typeof PlaceMiniMap>[0]> = {}) {
    return renderToStaticMarkup(
      createElement(PlaceMiniMap, {
        lng: -77.40837,
        lat: 39.41279,
        name: "Carroll Creek Linear Park",
        address: "50 Carroll Creek Way",
        color: "#315A43",
        ...props,
      }),
    );
  }

  it("server-renders the owned-basemap placeholder when Static Images are off", () => {
    process.env.MAPBOX_STATIC_MAPS_ENABLED = "0";
    process.env.MAPBOX_STATIC_DAILY_REQUEST_CAP = "500";
    // Other map features may legitimately configure the shared server token;
    // the dedicated Static Images switch must still prevent this request.
    process.env.MAPBOX_SERVER_TOKEN = "pk.test-server-token";

    const html = renderLocator();

    expect(html).toContain('data-owned-mini-map="placeholder"');
    expect(html).toContain(
      'aria-label="Location of Carroll Creek Linear Park, 50 Carroll Creek Way"',
    );
    expect(html).toContain("50 Carroll Creek Way");
    expect(html).toContain("Open map");
    expect(html).toContain('aria-label="Open the map centered on Carroll Creek Linear Park"');
    expect(html).toContain("/map?c=-77.40837,39.41279,15.5");
    // A fixed-height box in every state, so the map arriving never shifts the page.
    expect(html).toContain("h-44");
    // MapLibre is never part of the server render; it mounts near the viewport.
    expect(html).not.toContain("maplibregl");
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain("/api/static-map");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('rel="prefetch"');
  });

  it("no longer draws the decorative grid, raw coordinates, or the retired red", () => {
    process.env.MAPBOX_STATIC_MAPS_ENABLED = "0";

    const html = renderLocator({ color: undefined });

    expect(html).not.toContain("data-local-locator");
    expect(html).not.toContain("linear-gradient");
    expect(html).not.toContain("Position only");
    expect(html).not.toContain("Radius locator");
    expect(html).not.toContain("39.4128° N");
    expect(html).not.toMatch(/e14328/i);
    expect(html).toContain("fill-[color:var(--app-brand)]");
  });

  it("names the place alone when no address is known", () => {
    process.env.MAPBOX_STATIC_MAPS_ENABLED = "0";

    const html = renderLocator({ address: "  " });

    expect(html).toContain('aria-label="Location of Carroll Creek Linear Park"');
    expect(html).not.toContain("data-mini-map-address");
  });

  it("keeps the owned basemap when the paid cap is zero", () => {
    process.env.MAPBOX_STATIC_MAPS_ENABLED = "1";
    process.env.MAPBOX_STATIC_DAILY_REQUEST_CAP = "0";
    process.env.MAPBOX_SERVER_TOKEN = "pk.test-server-token";

    const html = renderLocator();

    expect(html).toContain('data-owned-mini-map="placeholder"');
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
    expect(html).toContain("pin=315a43");
    expect(html).toContain("/map?c=-77.40837,39.41279,15.5");
    expect(html).toContain('width="640"');
    expect(html).toContain('height="300"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain("Map preview unavailable. Open the live map.");
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("data-owned-mini-map");
    expect(html).not.toContain('rel="prefetch"');
  });

  it("pins the static image in Brick when the category color is not a hex", () => {
    process.env.MAPBOX_STATIC_MAPS_ENABLED = "1";
    process.env.MAPBOX_STATIC_DAILY_REQUEST_CAP = "25";
    process.env.MAPBOX_SERVER_TOKEN = "pk.test-server-token";

    const html = renderLocator({ color: "var(--app-brand)" });

    expect(html).toContain("pin=b5462b");
    expect(html).not.toMatch(/e14328/i);
  });
});
