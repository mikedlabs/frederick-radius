import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlaceMedallion } from "./PlaceMedallion";

const PLACE = {
  slug: "gravel-and-grind",
  name: "Gravel & Grind",
  category: "coffee",
};

describe("PlaceMedallion", () => {
  it("renders an approved place photo as a compact lazy image", () => {
    const html = renderToStaticMarkup(
      createElement(PlaceMedallion, {
        place: {
          ...PLACE,
          google_photo_url:
            "/api/place-photo?name=places%2FChIJtest%2Fphotos%2Ffront&w=800",
        },
        size: 32,
        shape: "circle",
        surface: "inverse",
      }),
    );

    expect(html).toContain('data-place-media="photo"');
    expect(html).toContain('data-place-slug="gravel-and-grind"');
    expect(html).toContain("<img");
    expect(html).toContain("places%2FChIJtest%2Fphotos%2Ffront");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("width:32px");
    expect(html).toContain("height:32px");
  });

  it("uses the category mark when a place has no approved photo", () => {
    const html = renderToStaticMarkup(
      createElement(PlaceMedallion, { place: PLACE }),
    );

    expect(html).toContain('data-place-media="fallback"');
    expect(html).toContain("<svg");
    expect(html).not.toContain("<img");
  });
});
