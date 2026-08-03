import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { medallionPhotoSrc, PlaceMedallion } from "./PlaceMedallion";

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
    expect(html).toContain("fallback=signal");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("width:32px");
    expect(html).toContain("height:32px");
    // The category mark sits underneath the real photo and becomes the quiet
    // fallback when the proxy returns its transparent failure signal.
    expect(html).toContain("<svg");
  });

  it("uses the category mark when a place has no approved photo", () => {
    const html = renderToStaticMarkup(
      createElement(PlaceMedallion, { place: PLACE }),
    );

    expect(html).toContain('data-place-media="fallback"');
    expect(html).toContain("<svg");
    expect(html).not.toContain("<img");
  });

  it("uses the compact failure signal without changing non-proxy photos", () => {
    expect(
      medallionPhotoSrc(
        "/api/place-photo?name=places%2FChIJtest%2Fphotos%2Ffront&w=800&slug=gravel-and-grind",
        44,
      ),
    ).toBe(
      "/api/place-photo?name=places%2FChIJtest%2Fphotos%2Ffront&w=88&slug=gravel-and-grind&fallback=signal",
    );
    expect(
      medallionPhotoSrc("https://images.example.com/coffee.jpg", 44),
    ).toBe("https://images.example.com/coffee.jpg");
  });
});
