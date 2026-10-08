import { describe, expect, it, vi } from "vitest";
import {
  venueEventsAsCards,
  venueEventsToCards,
  type VenueEvent,
} from "@/lib/loaders/venueEvents";
import { prepareEventArchiveRows } from "@/lib/events/event-archive-batch";
import { mergeUnifiedEventCards } from "@/lib/loaders/unifiedEvents";

const committedInventory = vi.hoisted(() => [15, 18].map((hour) => ({
  title: "Disney’s Dare to Dream JR.",
  starts_at: `2026-10-25T${hour}:00:00-04:00`,
  venue_slug: "weinberg-center",
  venue_name: "Weinberg Center for the Arts",
  category: "theater",
  source: { url: "https://weinbergcenter.org/performances/?venue=weinberg-center", fetchedAt: "2026-10-08T13:46:46Z" },
})));
vi.mock("@/data/venue-events.json", () => ({ default: committedInventory }));

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
  it("keeps both published same-day performances through the unified feed and archive", () => {
    const cards = venueEventsToCards(committedInventory);
    expect(cards.map((card) => card.slug)).toEqual([
      "disney-s-dare-to-dream-jr-2026-10-25-20261025t190000000z",
      "disney-s-dare-to-dream-jr-2026-10-25-20261025t220000000z",
    ]);
    expect(venueEventsToCards([...committedInventory].reverse()).map((card) => card.slug))
      .toEqual(cards.map((card) => card.slug));
    const unified = mergeUnifiedEventCards([], [], cards, []);
    expect(unified.map((card) => card.starts_at)).toEqual([
      "2026-10-25T15:00:00-04:00", "2026-10-25T18:00:00-04:00",
    ]);
    const archive = prepareEventArchiveRows(unified);
    expect(archive.truncated).toBe(false);
    expect(archive.rows.map((row) => row.source_uid)).toEqual([
      "venue:weinberg-center:2026-10-25T19:00:00.000Z",
      "venue:weinberg-center:2026-10-25T22:00:00.000Z",
    ]);
    expect(new Set(archive.rows.map((row) => row.slug)).size).toBe(2);
  });

  it("keeps the evening route stable after the matinee ends", () => {
    const before = venueEventsAsCards(new Date("2026-10-25T18:00:00Z"));
    const after = venueEventsAsCards(new Date("2026-10-25T21:30:00Z"));
    expect(before).toHaveLength(2);
    expect(after).toHaveLength(1);
    expect(after[0].source_id).toBe(before[1].source_id);
    expect(after[0].slug).toBe(before[1].slug);
  });

  it("preserves the existing singleton route when Weinberg attribution moves to New Spire", () => {
    const old = event({ title: "Las Áñez", starts_at: "2026-10-08T19:30:00-04:00", venue_slug: "weinberg-center", venue_name: "Weinberg Center for the Arts" });
    const corrected = { ...old, starts_at: "2026-10-08T19:30-04:00", venue_slug: "new-spire", venue_name: "New Spire Arts" };
    const [before] = venueEventsToCards([old]);
    const [after] = venueEventsToCards([corrected]);
    expect(before.slug).toBe("las-ez-2026-10-08");
    expect(after.slug).toBe(before.slug);
    expect(after.source_id).toBe("venue:new-spire:2026-10-08T23:30:00.000Z");
  });

  it("retains simultaneous same-title performances at two resolved venues", () => {
    const rows = [
      event({ title: "Published Family Performance", starts_at: "2026-10-25T15:00:00-04:00", venue_slug: "weinberg-center", venue_name: "Weinberg Center for the Arts" }),
      event({ title: "Published Family Performance", starts_at: "2026-10-25T15:00:00-04:00", venue_slug: "new-spire", venue_name: "New Spire Arts" }),
    ];
    const cards = venueEventsToCards(rows);
    expect(cards.every((card) => Boolean(card.venue_place_slug))).toBe(true);
    expect(new Set(cards.map((card) => card.slug)).size).toBe(2);
    expect(cards[0].slug).toMatch(/-weinberg-center$/);
    expect(cards[1].slug).toMatch(/-new-spire$/);
    expect(mergeUnifiedEventCards([], [], cards, [])).toHaveLength(2);
    expect(prepareEventArchiveRows(cards).rows).toHaveLength(2);
  });

  it("retains explicit performances less than an hour apart", () => {
    const rows = [15, 15.5].map((hour) => event({
      title: "Published Family Performance",
      starts_at: `2026-10-25T15:${hour === 15 ? "00" : "30"}:00-04:00`,
      venue_slug: "weinberg-center",
      venue_name: "Weinberg Center for the Arts",
    }));
    const cards = venueEventsToCards(rows);
    expect(mergeUnifiedEventCards([], [], cards, [])).toHaveLength(2);
  });

  it.each([
    {
      starts: ["2026-11-01T01:30:00-04:00", "2026-11-01T01:30:00-05:00"],
      suffixes: ["20261101t053000000z", "20261101t063000000z"],
    },
    {
      starts: ["2026-11-01T00:30:00-04:00", "2026-11-01T23:30:00-05:00"],
      suffixes: ["20261101t043000000z", "20261102t043000000z"],
    },
  ])("keeps fallback-day occurrences distinct for $starts", ({ starts, suffixes }) => {
    const cards = venueEventsToCards(starts.map((starts_at) => event({
      title: "Published Family Performance",
      starts_at,
      category: "community",
      venue_slug: "weinberg-center",
      venue_name: "Weinberg Center for the Arts",
    })));
    expect(cards.map((card) => card.slug)).toEqual(suffixes.map((suffix) =>
      `published-family-performance-2026-11-01-${suffix}`));
    expect(mergeUnifiedEventCards([], [], cards, [])).toHaveLength(2);
    expect(prepareEventArchiveRows(cards).rows).toHaveLength(2);
  });

  it("still merges a runtime singleton copy of a suffixed snapshot occurrence", () => {
    const cards = venueEventsToCards(committedInventory);
    const runtime = venueEventsToCards([committedInventory[1]]);
    const unified = mergeUnifiedEventCards([], [], [...cards, ...runtime], []);
    expect(unified).toHaveLength(2);
    expect(unified.map((card) => card.slug)).toEqual(cards.map((card) => card.slug));
  });

  it("does not create a collision suffix for repeated copies of one occurrence", () => {
    const row = event({ title: "Bluegrass Jam" });
    const cards = venueEventsToCards([row, row]);
    expect(cards[0].slug).toBe(cards[1].slug);
    expect(cards[0].slug).toBe("bluegrass-jam-2026-08-01");
    expect(mergeUnifiedEventCards([], [], cards, [])).toHaveLength(1);
  });

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
