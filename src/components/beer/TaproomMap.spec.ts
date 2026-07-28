import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import TaproomMap from "./TaproomMap";

describe("TaproomMap", () => {
  it("renders the full county overview without an activation dead end", () => {
    const place = (
      slug: string,
      municipality: string,
      lng: number,
      lat: number,
    ) =>
      ({
        slug,
        name: slug,
        municipality,
        category: "brewery",
        geom: { lng, lat },
      }) as PlaceCardData;
    const places = [
      place("downtown-one", "frederick", -77.41, 39.42),
      place("downtown-two", "frederick", -77.4, 39.43),
      place("farm-one", "mount-airy", -77.18, 39.41),
      place("river-one", "brunswick", -77.63, 39.31),
    ];
    const html = renderToStaticMarkup(
      createElement(TaproomMap, { places }),
    );

    expect(html).toContain('data-brewery-map-count="4"');
    expect(html).toContain("All 4 brewery guides start in view.");
    expect(html).toContain("Frederick City");
    expect(html).toContain("Mount Airy");
    expect(html).toContain(
      'aria-label="Interactive map of 4 Frederick County breweries"',
    );
    expect(html).not.toContain("Open the brewery map");
  });
});
