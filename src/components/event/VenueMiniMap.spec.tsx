import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import VenueMiniMap from "./VenueMiniMap";

describe("VenueMiniMap", () => {
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

  function renderMap() {
    return renderToStaticMarkup(
      createElement(VenueMiniMap, {
        geom: { lng: -77.40837, lat: 39.41279 },
        name: "Carroll Creek Linear Park",
      }),
    );
  }

  it("does not call the paid static-map proxy when Static Images are off", () => {
    process.env.MAPBOX_STATIC_MAPS_ENABLED = "0";
    process.env.MAPBOX_STATIC_DAILY_REQUEST_CAP = "500";
    process.env.MAPBOX_SERVER_TOKEN = "pk.test-server-token";

    const html = renderMap();

    expect(html).toContain('data-local-locator="true"');
    expect(html).toContain("Radius locator");
    expect(html).toContain("Open map");
    expect(html).not.toContain("/api/static-map");
    expect(html).not.toContain("<img");
  });

  it("uses the static-map image only when the paid path is ready", () => {
    process.env.MAPBOX_STATIC_MAPS_ENABLED = "1";
    process.env.MAPBOX_STATIC_DAILY_REQUEST_CAP = "25";
    process.env.MAPBOX_SERVER_TOKEN = "pk.test-server-token";

    const html = renderMap();

    expect(html).toContain("/api/static-map?lng=-77.40837&amp;lat=39.41279");
    expect(html).toContain('width="1280"');
    expect(html).toContain('height="560"');
    expect(html).not.toContain('data-local-locator="true"');
  });
});
