import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import {
  compareEventsForDecision,
  eventsWithDecisionDistance,
} from "./decision-rank";

function event(
  slug: string,
  {
    lat = 39.414,
    lng = -77.411,
    title = slug,
    category = "music",
    geoConfidence = "venue_match",
    image,
  }: {
    lat?: number;
    lng?: number;
    title?: string;
    category?: string;
    geoConfidence?: EventWithMeta["geo_confidence"];
    image?: string;
  } = {},
): EventWithMeta {
  return {
    slug,
    title,
    description: "",
    starts_at: "2026-08-10T23:00:00.000Z",
    ends_at: "2026-08-11T01:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Test venue",
    address: "1 Test St",
    geom: { lat, lng },
    municipality: "frederick",
    category,
    audience: [],
    is_free: true,
    source: "manual",
    is_verified: true,
    source_id: slug,
    source_url: "https://example.com/event",
    license: "test",
    confidence: "curated",
    first_seen_at: "2026-08-01T12:00:00.000Z",
    last_verified_at: "2026-08-08T12:00:00.000Z",
    geo_confidence: geoConfidence,
    category_name: category,
    municipality_name: "Frederick",
    hero_image: image,
    attendance_mode: "physical",
  };
}

describe("event decision ranking", () => {
  const origin = { lat: 39.414, lng: -77.411 };

  it("uses proximity to settle comparable events before decorative imagery", () => {
    const [nearby, farther] = eventsWithDecisionDistance(
      [
        event("nearby"),
        event("farther", { lat: 39.5, lng: -77.5, image: "/event.jpg" }),
      ],
      origin,
    );

    expect([farther, nearby].sort((a, b) => compareEventsForDecision(a, b))[0]?.slug)
      .toBe("nearby");
  });

  it("does not let a nearby routine program outrank a farther draw", () => {
    const [routine, draw] = eventsWithDecisionDistance(
      [
        event("routine", { title: "Toddler Storytime" }),
        event("draw", { title: "Frederick Music Festival", lat: 39.5, lng: -77.5 }),
      ],
      origin,
    );

    expect([routine, draw].sort((a, b) => compareEventsForDecision(a, b))[0]?.slug)
      .toBe("draw");
  });

  it("preserves an explicit editorial feature", () => {
    const rows = eventsWithDecisionDistance(
      [event("nearby"), event("featured", { lat: 39.5, lng: -77.5 })],
      origin,
    );

    expect(rows.sort((a, b) => compareEventsForDecision(a, b, new Set(["featured"])))[0]?.slug)
      .toBe("featured");
  });

  it("never stamps distance on an area-centroid event", () => {
    const [area] = eventsWithDecisionDistance(
      [event("area", { geoConfidence: "area" })],
      origin,
    );

    expect(area.distance_m).toBeUndefined();
  });
});
