import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BreweryPhoto } from "./BreweryPhoto";

describe("BreweryPhoto", () => {
  it("uses the sourced brewery mark when no publishable taproom photo is available", () => {
    const html = renderToStaticMarkup(
      createElement(BreweryPhoto, {
        brewerySlug: "olde-mother-brewing-frederick",
        breweryName: "Olde Mother Brewing",
        photo: null,
        sizes: "180px",
      }),
    );

    expect(html).toContain('data-brewery-media="mark"');
    expect(html).toContain(
      "/images/beer/logos/olde-mother-brewing-frederick.jpg",
    );
    expect(html).toContain("Olde Mother Brewing");
    expect(html).not.toContain(">OM<");
  });

  it("keeps an attributable photo as the first choice", () => {
    const html = renderToStaticMarkup(
      createElement(BreweryPhoto, {
        brewerySlug: "attaboy-beer-frederick",
        breweryName: "Attaboy Beer",
        photo: {
          src: "/api/place-photo?name=test",
          attribution: {
            photo_name: "places/test/photos/test",
            google_maps_uri: "https://maps.google.com/",
            authors: [
              {
                display_name: "Local photographer",
                uri: "https://maps.google.com/",
              },
            ],
          },
        },
        sizes: "180px",
        showLabel: true,
      }),
    );

    expect(html).toContain('data-brewery-media="photo"');
    expect(html).toContain("Local photographer");
    expect(html).toContain("Attaboy Beer");
    expect(html).not.toContain(
      "/images/beer/logos/attaboy-beer-frederick.jpg",
    );
  });
});
