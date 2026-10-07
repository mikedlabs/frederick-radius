import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { buildHorizonBounds, groupByHorizon } from "@/lib/eventHorizon";
import { compareForLead } from "@/lib/events/lead-rank";
import {
  collapseLaterSeries,
  initialEventsForBrowse,
  prepareEventsForBrowse,
  seriesCadence,
  slimEventForBrowse,
  summarizeEventsForBrowse,
} from "./browsePayload";

const NOW = new Date("2026-07-14T12:00:00.000Z");
const BOUNDS = buildHorizonBounds(NOW);

function event(
  slug: string,
  startsAt: string,
  overrides: Partial<EventWithMeta> = {},
): EventWithMeta {
  return {
    slug,
    title: `Event ${slug}`,
    description: "A".repeat(400),
    starts_at: startsAt,
    ends_at: new Date(Date.parse(startsAt) + 2 * 3_600_000).toISOString(),
    timezone: "America/New_York",
    venue_name: "Test Venue",
    address: "1 Test St",
    geom: { lng: -77.41, lat: 39.41 },
    municipality: "frederick",
    category: "music",
    audience: [],
    is_free: false,
    ticket_url: "https://example.com/ticket",
    source: "seed",
    is_verified: true,
    source_id: slug,
    source_url: "https://example.com/source",
    license: "test",
    confidence: "curated",
    first_seen_at: NOW.toISOString(),
    last_verified_at: NOW.toISOString(),
    geo_confidence: "venue_match",
    category_name: "Music",
    municipality_name: "Frederick",
    ...overrides,
  };
}

describe("events browse payload", () => {
  it("keeps browse provenance while removing detail-only fields and clamping descriptions", () => {
    const heroImageAttribution = {
      kind: "venue" as const,
      venue_name: "Test Venue",
      provider: "google_maps" as const,
      source_uri: "https://www.google.com/maps/place/example-photo",
      authors: [],
    };
    const slim = slimEventForBrowse(
      event("slim", "2026-07-14T14:00:00.000Z", {
        hero_image: "/api/place-photo?name=credited",
        hero_image_attribution: heroImageAttribution,
      }),
    );

    expect(slim.description).toHaveLength(160);
    expect("ticket_url" in slim).toBe(false);
    expect(slim.has_tickets).toBe(true);
    expect(
      "has_tickets" in slimEventForBrowse(event("free", "2026-07-14T14:00:00.000Z", { ticket_url: undefined })),
    ).toBe(false);
    expect(slim.source_url).toBe("https://example.com/source");
    expect(slim.source).toBe("seed");
    expect(slim.geo_confidence).toBe("venue_match");
    expect(slim.municipality_name).toBe("Frederick");
    expect(slim.hero_image_attribution).toEqual(heroImageAttribution);
  });

  it("carries the frequent-series stamp so the client re-sort ranks like the server", () => {
    const stamped = slimEventForBrowse(
      event("game-night", "2026-07-14T22:00:00.000Z", { frequent_series: true }),
    );
    expect(stamped.frequent_series).toBe(true);
    expect(
      "frequent_series" in slimEventForBrowse(event("one-off", "2026-07-14T22:00:00.000Z")),
    ).toBe(false);
  });

  it("keeps every current occurrence in the browse corpus and collapses only display rows", () => {
    const prepared = prepareEventsForBrowse([
      event("ended", "2026-07-14T08:00:00.000Z", {
        ends_at: "2026-07-14T10:00:00.000Z",
      }),
      event("near-1", "2026-07-14T14:00:00.000Z", { title: "Storytime" }),
      event("near-2", "2026-07-14T17:00:00.000Z", { title: "Storytime" }),
      event("later-1", "2026-08-01T14:00:00.000Z", { title: "Weekly Jam" }),
      event("later-2", "2026-08-08T14:00:00.000Z", { title: "Weekly Jam" }),
      event("later-3", "2026-08-15T14:00:00.000Z", { title: "Weekly Jam" }),
    ], BOUNDS);
    const displayed = collapseLaterSeries(prepared, BOUNDS);

    expect(prepared.map((item) => item.slug)).toEqual([
      "near-1",
      "near-2",
      "later-1",
      "later-2",
      "later-3",
    ]);
    // Two showings on the same next day are both real choices.
    expect(displayed.map((item) => item.slug)).toEqual(["near-1", "near-2", "later-1"]);
    // August 1, 8 and 15, 2026 are Saturdays a week apart.
    expect(displayed[2].recurrence_text).toBe("Every Saturday");
  });

  it("collapses an unmarked weekly series across every horizon to its next date", () => {
    // UI audit: a weekly trivia night appeared under Today, Later this week
    // and Coming up because only `later` rows collapsed and the key changed
    // with the publisher's is_recurring flag.
    const prepared = prepareEventsForBrowse([
      event("trivia-1", "2026-07-15T23:00:00.000Z", { title: "Trivia Night | Round 1", venue_name: "Olde Mother" }),
      event("trivia-2", "2026-07-22T23:00:00.000Z", { title: "Trivia Night | Round 2", venue_name: "Olde Mother" }),
      event("trivia-3", "2026-07-29T23:00:00.000Z", { title: "Trivia Night", venue_name: "Olde Mother", is_recurring: true }),
      event("other-venue", "2026-07-22T23:00:00.000Z", { title: "Trivia Night", venue_name: "Steinhardt" }),
    ], BOUNDS);
    const displayed = collapseLaterSeries(prepared, BOUNDS);

    expect(displayed.map((item) => item.slug)).toEqual(["trivia-1", "other-venue"]);
    expect(displayed[0]).toMatchObject({ is_recurring: true, recurrence_text: "Every Wednesday" });
    expect(displayed[1].recurrence_text).toBeUndefined();
  });

  it("merges 'Centennial Event: X' with 'X' at the same venue and start", () => {
    const prepared = prepareEventsForBrowse([
      event("centennial-fall-fest", "2026-07-18T14:00:00.000Z", {
        title: "Centennial Event: Fall Fest",
        venue_name: "Baker Park",
      }),
      event("fall-fest", "2026-07-18T14:00:00.000Z", {
        title: "Fall Fest",
        venue_name: "Baker Park",
        hero_image: "/api/place-photo?name=baker-park",
      }),
      event("fall-fest-later", "2026-07-18T18:00:00.000Z", {
        title: "Fall Fest",
        venue_name: "Baker Park",
      }),
      event("fall-fest-elsewhere", "2026-07-18T14:00:00.000Z", {
        title: "Fall Fest",
        venue_name: "Carroll Creek",
      }),
    ], BOUNDS);

    expect(prepared.map((item) => item.slug)).toEqual([
      "fall-fest",
      "fall-fest-later",
      "fall-fest-elsewhere",
    ]);
  });

  it("reads a cadence from the dates, never a guess", () => {
    expect(seriesCadence(["2026-10-07", "2026-10-14", "2026-10-21"])).toBe("Every Wednesday");
    expect(seriesCadence(["2026-10-09", "2026-10-23"])).toBe("Every other Friday");
    expect(seriesCadence(["2026-10-08", "2026-10-22", "2026-10-29"])).toBe("Thursdays");
    expect(seriesCadence(["2026-10-10", "2026-10-11", "2026-10-12"])).toBe("Daily through Oct 12");
    expect(seriesCadence(["2026-10-07", "2026-10-09"])).toBeNull();
    expect(seriesCadence(["2026-10-07"])).toBeNull();
  });

  it("retains recurring dates for filters while the default initial list shows one representative", () => {
    const recurrence = "Every Thursday, May 7 – September 24, 2026";
    const prepared = prepareEventsForBrowse([
      event("alive-at-five-2026-07-14", "2026-07-14T21:00:00.000Z", {
        title: "Alive @ Five · Ballistic Berry",
        venue_name: "Carroll Creek Amphitheater",
        is_recurring: true,
        recurrence_text: recurrence,
      }),
      event("alive-at-five-2026-07-23", "2026-07-23T21:00:00.000Z", {
        title: "Alive @ Five · My Chemical Bromance",
        venue_name: "Carroll Creek Amphitheater",
        is_recurring: true,
        recurrence_text: recurrence,
      }),
      event("alive-at-five-2026-07-30", "2026-07-30T21:00:00.000Z", {
        title: "Alive @ Five: Season Finale · Kate Cosentino",
        venue_name: "Carroll Creek Amphitheater",
        is_recurring: true,
        recurrence_text: recurrence,
      }),
    ], BOUNDS);
    const initial = initialEventsForBrowse(prepared, BOUNDS);
    const summary = summarizeEventsForBrowse(prepared, BOUNDS);

    expect(prepared).toHaveLength(3);
    expect(initial).toHaveLength(1);
    expect(initial[0].slug).toBe("alive-at-five-2026-07-14");
    expect(initial[0].title).toBe("Alive @ Five · Ballistic Berry");
    expect(initial[0].recurrence_text).toBe(`${recurrence} · 3 upcoming dates`);
    expect(summary.totalCount).toBe(3);
    expect(summary.dayCounts).toMatchObject({
      "2026-07-14": 1,
      "2026-07-23": 1,
      "2026-07-30": 1,
    });
  });

  it("ships six cards per horizon while retaining complete summary counts", () => {
    const today = Array.from({ length: 9 }, (_, index) =>
      event(`today-${index}`, `2026-07-14T${String(13 + index).padStart(2, "0")}:00:00.000Z`, {
        venue_name: `Today Venue ${index}`,
      }),
    );
    const later = Array.from({ length: 10 }, (_, index) =>
      event(`later-${index}`, `2026-08-${String(1 + index).padStart(2, "0")}T14:00:00.000Z`, {
        venue_name: `Later Venue ${index}`,
      }),
    );
    const prepared = prepareEventsForBrowse([...today, ...later], BOUNDS);
    const initial = initialEventsForBrowse(prepared, BOUNDS);
    const summary = summarizeEventsForBrowse(prepared, BOUNDS);
    const initialGroups = groupByHorizon(initial, BOUNDS);

    expect(initialGroups.every((group) => group.events.length <= 6)).toBe(true);
    expect(initial).toHaveLength(12);
    expect(summary.totalCount).toBe(19);
    expect(summary.horizonCounts.today).toBe(9);
    expect(summary.horizonCounts.later).toBe(10);
  });

  it("includes a distinctive recommended lead in the bounded first paint", () => {
    const routines = Array.from({ length: 8 }, (_, index) =>
      event(`routine-${index}`, `2026-07-14T${String(13 + index).padStart(2, "0")}:00:00.000Z`, {
        title: `Beginner Yoga ${index}`,
        category: "wellness",
      }),
    );
    const concert = event("concert", "2026-07-14T23:00:00.000Z", {
      title: "Summer Concert",
      category: "music",
      ticket_url: "https://example.com/concert",
    });

    const prepared = prepareEventsForBrowse([...routines, concert], BOUNDS);
    const initial = initialEventsForBrowse(prepared, BOUNDS);

    expect(initial.map((item) => item.slug)).toContain("concert");
    expect(initial).toHaveLength(6);
  });

  it("ranks a one-off ticketed show over a weekly routine after slimming", () => {
    // UI audit, Oct 2026: the ticketed-show signal in lead-rank never ran on
    // the board because the slim row dropped ticket_url, so a weekly Game
    // Night that starts sooner led a one-off ticketed show.
    const gameNight = event("game-night", "2026-07-14T22:00:00.000Z", {
      title: "Game Night",
      category: "nightlife",
      venue_name: "Olde Mother Brewing",
      hero_image: "/api/place-photo?name=game-night",
      is_recurring: true,
      recurrence_text: "Every Tuesday",
      ticket_url: undefined,
    });
    const lasAnez = event("las-anez", "2026-07-14T23:30:00.000Z", {
      title: "Las Áñez",
      category: "theater",
      venue_name: "New Spire Arts",
      hero_image: "/api/place-photo?name=las-anez",
      ticket_url: "https://www.weinbergcenter.org",
    });

    const prepared = prepareEventsForBrowse([gameNight, lasAnez], BOUNDS);
    // The client sorts these slim rows; it must agree with the full records.
    expect([...prepared].sort((a, b) => compareForLead(a, b)).map((e) => e.slug)).toEqual([
      "las-anez",
      "game-night",
    ]);
    expect([gameNight, lasAnez].sort((a, b) => compareForLead(a, b)).map((e) => e.slug)).toEqual([
      "las-anez",
      "game-night",
    ]);
    // The server's bounded first paint picks the same lead.
    expect(initialEventsForBrowse(prepared, BOUNDS, 1).map((e) => e.slug)).toEqual(["las-anez"]);
  });
});
