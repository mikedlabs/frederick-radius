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
    expect(html).toContain("Frederick County brewery");
    expect(html).not.toContain(">OM<");
    // The caption sits below the mark in normal flow, so a white mark card in
    // dark appearance can never cover it.
    expect(html).toContain("@min-[9rem]:flex-col");
    expect(html).not.toMatch(/absolute[^"]*bottom-3/);
    // A tile too small for the caption (a 56px row thumb) shows the mark alone.
    expect(html).toContain("@container");
    expect(html).toContain("hidden w-full max-w-[14rem] self-start @min-[9rem]:block");
  });

  it("drops the fallback caption when a title already sits beside the tile", () => {
    const html = renderToStaticMarkup(
      createElement(BreweryPhoto, {
        brewerySlug: "olde-mother-brewing-frederick",
        breweryName: "Olde Mother Brewing",
        photo: null,
        decorative: true,
        caption: false,
        sizes: "180px",
      }),
    );

    // The mark still identifies the brewery; the printed name and its
    // "Frederick County brewery" line are left to the adjacent title.
    expect(html).toContain('data-brewery-media="mark"');
    expect(html).toContain(
      "/images/beer/logos/olde-mother-brewing-frederick.jpg",
    );
    expect(html).not.toContain("Olde Mother Brewing");
    expect(html).not.toContain("Frederick County brewery");
    // With no caption to clear, the mark is centered at its own size.
    expect(html).not.toContain("flex-col");
    expect(html).toContain("h-[58%]");
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
