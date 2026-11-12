import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { buildRelatedEventSections } from "./eventRelated";

function event(
  slug: string,
  startsAt: string,
  venue = "Test venue",
): EventWithMeta {
  return {
    slug,
    title: slug.replace(/-\d+$/, ""),
    description: "",
    starts_at: startsAt,
    ends_at: new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
    timezone: "America/New_York",
    is_recurring: true,
    venue_name: venue,
    address: "Frederick, MD",
    geom: { lng: -77.4105, lat: 39.4143 },
    municipality: "frederick",
    category: "community",
    audience: [],
    is_free: true,
    source: "celebrate",
    is_verified: false,
    source_id: slug,
    source_url: "https://example.com",
    license: "test",
    first_seen_at: startsAt,
    last_verified_at: startsAt,
    confidence: "partner",
    geo_confidence: "exact_address",
    category_name: "Community",
    municipality_name: "Frederick",
  };
}

describe("buildRelatedEventSections", () => {
  it("builds bounded series and same-venue shelves from archived snapshots", () => {
    const now = new Date("2030-01-01T12:00:00.000Z");
    const current = event(
      "weekly-jazz-1",
      "2030-01-02T23:00:00.000Z",
      "The Venue",
    );
    const nextDate = event(
      "weekly-jazz-2",
      "2030-01-09T23:00:00.000Z",
      "The Venue",
    );
    const differentTitleSameVenue = {
      ...event(
        "film-night",
        "2030-01-03T23:00:00.000Z",
        "The Venue",
      ),
      title: "Film Night",
      is_recurring: false,
    };
    const secondSameVenue = {
      ...event(
        "author-talk",
        "2030-01-04T23:00:00.000Z",
        "The Venue",
      ),
      title: "Author Talk",
      is_recurring: false,
    };

    const result = buildRelatedEventSections(current, now, [
      nextDate,
      differentTitleSameVenue,
      secondSameVenue,
    ]);

    expect(result.lineup.map((row) => row.slug)).toEqual(["weekly-jazz-2"]);
    expect(result.moreUpcoming.title).toBe("More at The Venue");
    expect(result.moreUpcoming.items.map((row) => row.slug)).toEqual([
      "film-night",
      "author-talk",
    ]);
  });

  it("keeps a publisher-labeled season finale in the stated recurring series", () => {
    const now = new Date("2030-08-27T14:00:00.000Z");
    const recurrence = "Every Thursday, May 7 - September 24, 2030";
    const publisher = "https://publisher.example/riverfront-thursdays";
    const current = {
      ...event(
        "riverfront-thursdays-2030-08-27",
        "2030-08-27T21:00:00.000Z",
        "Riverfront Stage",
      ),
      title: "Riverfront Thursdays · Current Artist",
      recurrence_text: recurrence,
      source_url: publisher,
    };
    const next = {
      ...event(
        "riverfront-thursdays-2030-09-03",
        "2030-09-03T21:00:00.000Z",
        "Riverfront Stage",
      ),
      title: "Riverfront Thursdays · Next Artist",
      recurrence_text: recurrence,
      source_url: publisher,
    };
    const finale = {
      ...event(
        "riverfront-thursdays-2030-09-24",
        "2030-09-24T21:00:00.000Z",
        "Riverfront Stage",
      ),
      title: "Riverfront Thursdays: Season Finale · Final Artist",
      recurrence_text: recurrence,
      source_url: publisher,
    };

    const result = buildRelatedEventSections(current, now, [next, finale]);

    expect(result.lineup.map((row) => row.slug)).toEqual([
      "riverfront-thursdays-2030-09-03",
      "riverfront-thursdays-2030-09-24",
    ]);
    expect(result.lineup.at(-1)).toMatchObject({
      starts_at: "2030-09-24T21:00:00.000Z",
      recurrence_text: recurrence,
      source_url: publisher,
    });
  });

  // November 11, 2026 hierarchy audit: an Emmitsburg event offered only
  // Frederick events as "more upcoming".
  describe("town context", () => {
    const now = new Date("2030-03-01T12:00:00.000Z");
    function inTown(
      slug: string,
      startsAt: string,
      municipality: string,
      venue: string,
    ): EventWithMeta {
      return {
        ...event(slug, startsAt, venue),
        title: slug.replace(/-/g, " "),
        is_recurring: false,
        municipality,
        municipality_name: municipality === "emmitsburg" ? "Emmitsburg" : "Frederick City",
      };
    }
    const current = inTown("game-time", "2030-03-02T17:00:00.000Z", "emmitsburg", "Emmitsburg Branch Library");
    const frederickSooner = inTown("downtown-concert", "2030-03-02T19:00:00.000Z", "frederick", "Weinberg Center");
    const emmitsburgOne = inTown("pancake-breakfast", "2030-03-05T13:00:00.000Z", "emmitsburg", "Vigilant Hose Company");
    const emmitsburgTwo = inTown("trail-cleanup", "2030-03-07T14:00:00.000Z", "emmitsburg", "Community Park");

    it("leads with the same town even when county events start sooner", () => {
      const result = buildRelatedEventSections(current, now, [
        frederickSooner,
        emmitsburgOne,
        emmitsburgTwo,
      ]);
      expect(result.moreUpcoming.title).toBe("More in Emmitsburg");
      expect(result.moreUpcoming.items.map((row) => row.slug)).toEqual([
        "pancake-breakfast",
        "trail-cleanup",
      ]);
    });

    it("names the county when nothing else is scheduled in the town", () => {
      const result = buildRelatedEventSections(current, now, [frederickSooner]);
      expect(result.moreUpcoming.title).toBe("Elsewhere in Frederick County");
      expect(result.moreUpcoming.items.map((row) => row.municipality)).toEqual(["frederick"]);
    });

    it("puts a single same-town event ahead of county events", () => {
      const result = buildRelatedEventSections(current, now, [frederickSooner, emmitsburgOne]);
      expect(result.moreUpcoming.title).toBe("More upcoming events");
      expect(result.moreUpcoming.items.map((row) => row.slug)).toEqual([
        "pancake-breakfast",
        "downtown-concert",
      ]);
    });

    it("never offers a closure notice or a meeting as something else to do", () => {
      const closure = { ...inTown("closure", "2030-03-03T05:00:00.000Z", "emmitsburg", "Emmitsburg"), title: "Town Offices Closed" };
      const meeting = { ...inTown("meeting", "2030-03-03T23:00:00.000Z", "emmitsburg", "Town Office"), title: "Planning Commission" };
      const result = buildRelatedEventSections(current, now, [closure, meeting, emmitsburgOne, emmitsburgTwo]);
      expect(result.moreUpcoming.items.map((row) => row.slug)).toEqual([
        "pancake-breakfast",
        "trail-cleanup",
      ]);
    });
  });
});
