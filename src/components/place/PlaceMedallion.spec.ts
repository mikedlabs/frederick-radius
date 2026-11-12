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
  it.each(["zoes-chocolate-company", "visitation-hotel", "gravel-and-grind"])("withholds unreviewed owned and supplied %s photos for current-appearance decisions", (slug) => {
    const html = renderToStaticMarkup(createElement(PlaceMedallion, {
      place: { ...PLACE, slug, google_photo_url: "/api/place-photo?name=places%2Funreviewed%2Fphotos%2Ffront&w=800" },
      requireCurrentAppearance: true,
      appearanceAsOf: new Date("2026-10-26T16:00:00.000Z"),
    }));
    expect(html).toContain('data-place-media="fallback"');
    expect(html).toContain(`<span aria-hidden="true"`);
    expect(html).toContain("<svg");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("/api/place-photo");
    expect(html).not.toContain("IMG_2732.jpg");
  });
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

  it("uses the exact owned Creek image before supplied Google media without requiring a lookup", () => {
    const html = renderToStaticMarkup(createElement(PlaceMedallion, {
      place: { ...PLACE, slug: "carroll-creek-linear-park-frederick", google_photo_url: "/api/place-photo?name=places%2Fcreek%2Fphotos%2Ffront&w=800" },
    }));
    const src = html.match(/<img[^>]*src="([^"]+)"/)?.[1];
    expect(new URL(src!, "https://frederickradius.local").searchParams.get("url"))
      .toBe("/images/places/carroll-creek-aerial.jpg");
    expect(html).toContain('data-place-photo-source="owned"');
    expect(html).not.toContain("/api/place-photo");
  });

  it("does not show a licensed photograph in a lockup without an independent credit surface", () => {
    const html = renderToStaticMarkup(createElement(PlaceMedallion, { place: { ...PLACE, slug: "new-market-historic-district-new-market" } }));
    expect(html).not.toContain("<img");
    expect(html).toContain('data-place-media="fallback"');
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
