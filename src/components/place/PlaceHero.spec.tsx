import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import PlaceHero from "./PlaceHero";
import { placeHeroMap } from "@/lib/place-page";

const BLACK_HOG = {
  name: "Black Hog BBQ",
  address: "118 S Market St",
  geom: { lng: -77.4111035, lat: 39.4111452 },
};

describe("PlaceHero", () => {
  const originalSwitch = process.env.MAPBOX_STATIC_MAPS_ENABLED;
  afterEach(() => {
    if (originalSwitch === undefined) delete process.env.MAPBOX_STATIC_MAPS_ENABLED;
    else process.env.MAPBOX_STATIC_MAPS_ENABLED = originalSwitch;
  });

  it("draws the place's block on the owned map when there is no photo", () => {
    process.env.MAPBOX_STATIC_MAPS_ENABLED = "0";
    const map = placeHeroMap(BLACK_HOG);
    expect(map?.caption).toBe("South Market St, near Carroll Creek");

    const html = renderToStaticMarkup(
      <PlaceHero slug="black-hog-bbq-bar" name="Black Hog BBQ" map={map} address={BLACK_HOG.address} />,
    );

    expect(html).toContain('data-place-hero-kind="map"');
    expect(html).toContain('data-owned-mini-map="placeholder"');
    expect(html).toContain("South Market St, near Carroll Creek");
    expect(html).toContain('aria-label="Open Black Hog BBQ on the Radius map"');
    expect(html).toContain("/map?c=-77.41110,39.41115,15.5");
    // The retired 148px plate: no seal, no glow, no category pill.
    expect(html).not.toContain("radial-gradient");
    expect(html).not.toContain("fg-plate");
    expect(html).not.toContain("uppercase");
  });

  it("renders nothing when there is neither a photo nor an address-level block", () => {
    const html = renderToStaticMarkup(
      <PlaceHero slug="mount-st-marys-emmitsburg" name="Mount St. Mary's" map={null} />,
    );
    // No empty band: the identity block leads the page.
    expect(html).toBe("");
  });

  it("shows the photo as taken, with no wash and no credit before it loads", () => {
    const html = renderToStaticMarkup(
      <PlaceHero
        slug="black-hog-bbq-bar"
        name="Black Hog BBQ"
        photoSrc="/api/place-photo?name=places%2Fone%2Fphotos%2Ftwo&w=1200&slug=black-hog-bbq-bar"
        map={placeHeroMap(BLACK_HOG)}
      />,
    );

    expect(html).toContain('data-place-hero-kind="photo"');
    expect(html).toContain("fallback=signal");
    // The Living Frame washes and the dark scrim are gone (BRAND_GUIDE:
    // no Brick or warm wash over a photograph).
    expect(html).not.toContain("soft-light");
    expect(html).not.toContain("radial-gradient");
    expect(html).not.toContain("linear-gradient");
    // Credit waits for a real load; the map waits for a failed one.
    expect(html).not.toContain("data-place-photo-credit");
    expect(html).not.toContain("Google Maps");
    expect(html).not.toContain("data-owned-mini-map");
  });

  it("tries a preferred landmark photo before the Google photo, one request at a time", () => {
    const preferred = renderToStaticMarkup(
      <PlaceHero
        slug="barbara-fritchie-house-frederick"
        name="Barbara Fritchie House"
        photoSrc="/api/place-photo?name=places%2Fx%2Fphotos%2Fy&w=1200"
      />,
    );
    expect(preferred.match(/<img/g)?.length ?? 0).toBe(1);
    expect(preferred).toContain("commons.wikimedia.org");
    expect(preferred).not.toContain("/api/place-photo");

    const google = renderToStaticMarkup(
      <PlaceHero
        slug="carroll-creek-linear-park-frederick"
        name="Carroll Creek Linear Park"
        photoSrc="/api/place-photo?name=places%2Fx%2Fphotos%2Fy&w=1200"
      />,
    );
    expect(google.match(/<img/g)?.length ?? 0).toBe(1);
    expect(google).toContain("/api/place-photo");
    expect(google).not.toContain("commons.wikimedia.org");
  });
});
