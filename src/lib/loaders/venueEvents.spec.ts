import { describe, expect, it } from "vitest";
import {
  venueEventsToCards,
  type VenueEvent,
} from "@/lib/loaders/venueEvents";
import { prepareEventArchiveRows } from "@/lib/events/event-archive-batch";
import { withVenueThumb } from "@/lib/loaders/eventThumb";
import fixture from "../../../tests/fixtures/steinhardt-squarespace.json" with { type: "json" };

function event(overrides: Partial<VenueEvent> = {}): VenueEvent {
  return {
    title: "Neighborhood workshop",
    starts_at: "2026-08-01T18:00:00.000Z",
    venue_slug: "unmatched-test-venue",
    venue_name: "Workshop host",
    source: {
      url: "https://example.com/events/neighborhood-workshop",
      fetchedAt: "2026-07-23T12:00:00.000Z",
    },
    ...overrides,
  };
}

describe("venue event attendance normalization", () => {
  it("does not turn an online-only extracted event into a downtown pin", () => {
    const [card] = venueEventsToCards([
      event({
        title: "Online neighborhood workshop",
        venue_name: "Virtual",
      }),
    ]);

    expect(card.attendance_mode).toBe("online");
    expect(card.venue_name).toBe("Online");
    expect(card.address).toBe("");
    expect(card.venue_place_slug).toBeUndefined();
    expect(card.geo_confidence).toBe("unknown");
    expect(card.online_url).toBe(
      "https://example.com/events/neighborhood-workshop",
    );
  });

  it("keeps a hybrid event attached to its physical venue", () => {
    const [card] = venueEventsToCards([
      event({
        title: "Neighborhood workshop (hybrid)",
        venue_name: "Workshop host",
        ticket_url: "https://example.com/register/neighborhood-workshop",
      }),
    ]);

    expect(card.attendance_mode).toBe("mixed");
    expect(card.venue_name).toBe("Workshop host");
    expect(card.online_url).toBe(
      "https://example.com/register/neighborhood-workshop",
    );
  });
});

describe("venue event mixed-calendar categories", () => {
  it("does not let a venue-level music stamp override a flea market title", () => {
    const [card] = venueEventsToCards([
      event({
        title: "Vintage Flea Market",
        category: "music",
      }),
    ]);

    expect(card.category).toBe("market");
  });

  it("keeps show-like events in the source category", () => {
    const [card] = venueEventsToCards([
      event({
        title: "Bluegrass Jam",
        category: "music",
      }),
    ]);

    expect(card.category).toBe("music");
  });
});

describe("venue event durable identity", () => {
  it("gives each dated venue listing its own stable archive identity", () => {
    const cards = venueEventsToCards([
      event({
        title: "Bluegrass Jam",
        category: "music",
        starts_at: "2026-08-05T23:00:00.000Z",
      }),
      event({
        title: "Bluegrass Jam",
        category: "music",
        starts_at: "2026-08-12T23:00:00.000Z",
      }),
    ]);

    expect(cards.map((card) => card.slug)).toEqual([
      "bluegrass-jam-2026-08-05",
      "bluegrass-jam-2026-08-12",
    ]);
    expect(cards.map((card) => card.source_id)).toEqual([
      "venue:unmatched-test-venue:2026-08-05T23:00:00.000Z",
      "venue:unmatched-test-venue:2026-08-12T23:00:00.000Z",
    ]);
    expect(new Set(cards.map((card) => card.source_id))).toHaveLength(2);
    const archive = prepareEventArchiveRows(cards);
    expect(archive.truncated).toBe(false);
    expect(archive.rows.map((row) => row.source_uid)).toEqual([
      "venue:unmatched-test-venue:2026-08-05T23:00:00.000Z",
      "venue:unmatched-test-venue:2026-08-12T23:00:00.000Z",
    ]);
  });

  it("keeps the same identity when publisher copy changes but the slot does not", () => {
    const [before, after] = venueEventsToCards([
      event({ title: "Bluegrass Jam" }),
      event({ title: "Wednesday Bluegrass Jam" }),
    ]);

    expect(before.slug).not.toBe(after.slug);
    expect(before.source_id).toBe(after.source_id);
  });
});


describe("source-bound venue event art priority", () => {
  const image = fixture.upcoming[0].assetUrl;
  const source = { url: "https://www.steinhardtbrewing.com/live-music-events", fetchedAt: "2026-10-17T12:00:00.000Z" };

  it("keeps the publisher source and art ahead of venue photography through thumbnail enrichment", () => {
    const [card] = venueEventsToCards([event({
      title: fixture.upcoming[0].title,
      venue_slug: "steinhardt-brewing-company-frederick",
      venue_name: "Steinhardt Brewing Company",
      hero_image: image, source,
    })]);
    const enriched = withVenueThumb(card);
    expect(enriched.hero_image).toBe(image);
    expect(enriched.hero_image_attribution).toBeUndefined();
    expect(enriched.source).toBe("venue-extract");
    expect(enriched.source_url).toBe(source.url);
  });

  it("does not promote the same CDN image under an unrelated source or venue", () => {
    for (const overrides of [
      { source: { ...source, url: "https://www.rockwellbrewery.com/events" } },
      { venue_slug: "rockwell-brewery-frederick", venue_name: "Rockwell Brewery" },
    ]) {
      const [card] = venueEventsToCards([event({ venue_slug: "steinhardt-brewing-company-frederick", venue_name: "Steinhardt Brewing Company", hero_image: image, source, ...overrides })]);
      expect(card.hero_image).not.toBe(image);
    }
  });
});
