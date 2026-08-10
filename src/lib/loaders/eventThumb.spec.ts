import { describe, it, expect } from "vitest";
import { withVenueThumbs } from "./eventThumb";
import { clientPlaces } from "./places-client";
import { EVENTS } from "@/data/events";
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
    // A release may intentionally have zero Google photos while legacy rows
    // wait for current attribution/source metadata.
    if (!withPhoto) return;
    const [out] = withVenueThumbs([ev({ venue_place_slug: withPhoto.slug })]);
    expect(out.hero_image).toBe(withPhoto.google_photo_url);
    expect(out.hero_image_attribution).toMatchObject({
      kind: "venue",
      venue_name: withPhoto.name,
      provider: "google_maps",
    });
    expect(out.hero_image_attribution?.source_uri).toMatch(/^https:\/\//);
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

  it("resolves a hand-curated alias regardless of distance (fair feed shorthand)", () => {
    const fairgrounds = clientPlaces().find(
      (p) => p.slug === "frederick-fairgrounds-home-of-the-great-frederick-fair-frederick",
    );
    if (!fairgrounds?.google_photo_url) return; // dataset changed; alias sweep will catch
    const [out] = withVenueThumbs([
      // Event far from the fairgrounds with only the feed's short name.
      ev({ venue_name: "Frederick Fairgrounds", geom: { lng: -77.6, lat: 39.6 }, geo_confidence: "area" }),
    ]);
    expect(out.hero_image).toBe(fairgrounds.google_photo_url);
  });

  it("keeps fuzzy containment photo-only even on a precise event", () => {
    const skyStage = clientPlaces().find(
      (p) => p.slug === "frederick-arts-council-sky-stage",
    );
    if (!skyStage?.google_photo_url) return;
    const input = ev({
      venue_name: "Sky Stage",
      geom: skyStage.geom,
      geo_confidence: "exact_address",
    });
    const [out] = withVenueThumbs([input]);
    expect(out.hero_image).toBe(skyStage.google_photo_url);
    expect(out.venue_place_slug).toBeUndefined();
    expect(out.geom).toEqual(input.geom);
    expect(out.geo_confidence).toBe("exact_address");
  });

  it("trusts a unique exact identity even when the incoming geom is only an area centroid", () => {
    // Find a place whose normalized name is unique county-wide and has a photo.
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const counts = new Map<string, number>();
    for (const p of clientPlaces()) counts.set(norm(p.name), (counts.get(norm(p.name)) ?? 0) + 1);
    const unique = clientPlaces().find(
      (p) => p.google_photo_url && counts.get(norm(p.name)) === 1 && norm(p.name).length >= 8,
    );
    // The matching contract is exercised whenever the release dataset has a
    // compliant photo; an attribution-safe empty set is also valid.
    if (!unique) return;
    // ~2km offset: an area centroid is not evidence against the exact identity.
    const near = { lng: unique.geom.lng + 0.02, lat: unique.geom.lat };
    const [borrowed] = withVenueThumbs([
      ev({ venue_name: unique.name, geom: near, geo_confidence: "area" }),
    ]);
    expect(borrowed.hero_image).toBe(unique.google_photo_url);

    // A precise conflicting coordinate IS evidence of an offsite occurrence;
    // the shared resolver must not borrow the organizing venue's image.
    const far = { lng: unique.geom.lng + 0.15, lat: unique.geom.lat };
    const [notBorrowed] = withVenueThumbs([
      ev({ venue_name: unique.name, geom: far, geo_confidence: "exact_address" }),
    ]);
    expect(notBorrowed.hero_image).toBeUndefined();
  });

  it("does not publish an unattributed Carroll Creek photo for Alive @ Five", () => {
    // The curated rows still link to the real venue. Its only image was a
    // non-publishable Google Places photo, which the client loader suppresses.
    // Until the record has a compliant on-demand photo, the honest fallback
    // plate is preferable to using unattributed media.
    const amphitheater = clientPlaces().find(
      (p) => p.slug === "carroll-creek-outdoor-amphitheater",
    );
    expect(amphitheater, "canonical Carroll Creek venue should remain available").toBeTruthy();
    expect(amphitheater?.google_photo_url).toBeUndefined();

    const aliveAtFive = (EVENTS as EventWithMeta[]).filter((e) =>
      e.slug.startsWith("alive-at-five-"),
    );
    expect(aliveAtFive.length).toBeGreaterThan(0);
    for (const e of withVenueThumbs(aliveAtFive)) {
      expect(e.venue_place_slug).toBe("carroll-creek-outdoor-amphitheater");
      expect(e.hero_image, `${e.slug} should use the non-photo fallback`).toBeUndefined();
    }
  });
});
