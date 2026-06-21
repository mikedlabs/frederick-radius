import { describe, it, expect } from "vitest";
import { withVenueThumbs } from "./eventThumb";
import { clientPlaces } from "./places-client";
import type { EventWithMeta } from "./events";

// withVenueThumbs only reads a handful of fields; build a minimal event and
// cast, so the fixtures stay readable.
function ev(over: Partial<EventWithMeta>): EventWithMeta {
  return {
    slug: "test-event",
    title: "Test Event",
    starts_at: "2026-06-21T14:00:00.000Z",
    geom: { lng: -77.41, lat: 39.41 },
    geo_confidence: "area",
    ...over,
  } as unknown as EventWithMeta;
}

describe("withVenueThumbs — venue-photo trust gates", () => {
  const withPhoto = clientPlaces().find((p) => p.google_photo_url);

  it("never overwrites an event's own hero image", () => {
    const [out] = withVenueThumbs([
      ev({ hero_image: "https://example.test/own.jpg", venue_name: "Brewer's Alley" }),
    ]);
    expect(out.hero_image).toBe("https://example.test/own.jpg");
  });

  it("borrows the venue photo on a canonical venue_place_slug link", () => {
    expect(withPhoto, "client dataset should have at least one photo").toBeTruthy();
    if (!withPhoto) return;
    const [out] = withVenueThumbs([ev({ venue_place_slug: withPhoto.slug })]);
    expect(out.hero_image).toBe(withPhoto.google_photo_url);
  });

  it("does NOT borrow a downtown shop's photo for a county event located only as 'Frederick' (the Voila bug)", () => {
    const voila = clientPlaces().find((p) => p.slug === "voila-in-frederick");
    // Even if that specific slug ever changes, the guard must hold for ANY
    // place sitting at the city centroid: a bare town name is not a venue.
    const anchor = voila ?? withPhoto;
    if (!anchor) return;
    const [out] = withVenueThumbs([
      ev({ venue_name: "Frederick", geom: anchor.geom, geo_confidence: "area" }),
    ]);
    expect(out.hero_image).toBeUndefined();
  });

  it("treats any municipality name as a non-venue (no photo borrow)", () => {
    if (!withPhoto) return;
    for (const town of ["Brunswick", "Thurmont", "Mount Airy", "Downtown Frederick"]) {
      const [out] = withVenueThumbs([
        ev({ venue_name: town, geom: withPhoto.geom, geo_confidence: "area" }),
      ]);
      expect(out.hero_image, `${town} should not borrow a photo`).toBeUndefined();
    }
  });
});
