import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { buildRelatedEventSections, relatedWeekendWindow } from "./eventRelated";

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
    venue_place_slug: venue.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
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
    expect(result.sections[0]?.title).toBe("More at The Venue");
    expect(result.sections[0]?.items.map((row) => row.slug)).toEqual([
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
});

// 2026-10 UI audit: related events came from the 30 soonest rows countywide,
// so every detail page ended with the Brunswick Walking Group.
describe("buildRelatedEventSections shelves", () => {
  // Tuesday, January 1, 2030 at 7 AM Eastern.
  const now = new Date("2030-01-01T12:00:00.000Z");
  const WEINBERG = { lng: -77.4117, lat: 39.4141 };

  function oneOff(
    slug: string,
    startsAt: string,
    over: Partial<EventWithMeta> = {},
  ): EventWithMeta {
    return {
      ...event(slug, startsAt, over.venue_name ?? `${slug} venue`),
      title: slug.replace(/-/g, " "),
      is_recurring: false,
      geom: WEINBERG,
      geo_confidence: "venue_match",
      ...over,
    };
  }

  // Saturday, January 5, 2030 at 8 PM Eastern.
  const show = oneOff("evening-show", "2030-01-06T01:00:00.000Z", {
    venue_name: "Weinberg Center for the Arts",
    venue_place_slug: "weinberg-center",
  });
  const walkingGroup = oneOff("brunswick-walking-group", "2030-01-01T13:00:00.000Z", {
    venue_name: "Brunswick Park",
    geom: { lng: -77.6266, lat: 39.3143 },
  });
  const north = (meters: number) => ({ lng: WEINBERG.lng, lat: WEINBERG.lat + meters / 111_000 });

  it("never fills a shelf with the county's soonest rows", () => {
    const result = buildRelatedEventSections(show, now, [walkingGroup]);
    const slugs = result.sections.flatMap((section) => section.items.map((row) => row.slug));
    expect(slugs).not.toContain("brunswick-walking-group");
    expect(result.sections).toEqual([]);
  });

  it("shows up to three more dates at the same venue", () => {
    const sameVenue = [1, 2, 3, 4, 5].map((day) =>
      oneOff(`weinberg-show-${day}`, `2030-01-${String(10 + day).padStart(2, "0")}T00:00:00.000Z`, {
        venue_name: "Weinberg Center for the Arts",
        venue_place_slug: "weinberg-center",
      }),
    );
    const result = buildRelatedEventSections(show, now, [...sameVenue].reverse());
    expect(result.sections[0]).toMatchObject({ kind: "venue", title: "More at Weinberg Center for the Arts" });
    expect(result.sections[0]?.items.map((row) => row.slug)).toEqual([
      "weinberg-show-1",
      "weinberg-show-2",
      "weinberg-show-3",
    ]);
  });

  it("offers same-night events within three hours and about 1.5 km", () => {
    const close = oneOff("jazz-at-the-cellar", "2030-01-06T00:00:00.000Z", { geom: north(500) });
    const late = oneOff("late-set", "2030-01-06T03:30:00.000Z", { geom: north(1_200) });
    const tooFar = oneOff("far-show", "2030-01-06T01:00:00.000Z", { geom: north(2_000) });
    const tooLate = oneOff("after-hours", "2030-01-06T04:30:00.000Z", { geom: north(300) });
    const vague = oneOff("somewhere-downtown", "2030-01-06T01:00:00.000Z", {
      geom: north(100),
      geo_confidence: "area",
    });
    const meeting = oneOff("council-meeting", "2030-01-06T01:00:00.000Z", {
      title: "City Council Meeting",
      geom: north(200),
    });

    const result = buildRelatedEventSections(show, now, [
      walkingGroup,
      tooFar,
      late,
      tooLate,
      vague,
      meeting,
      close,
    ]);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toMatchObject({ kind: "nearby", title: "Same night nearby" });
    expect(result.sections[0]?.items.map((row) => row.slug)).toEqual([
      "jazz-at-the-cellar",
      "late-set",
    ]);
  });

  it("falls back to the event's weekend, picking draws over standing programs", () => {
    const anywhere = { lng: -77.35, lat: 39.48 };
    const storytime = oneOff("family-storytime", "2030-01-05T15:00:00.000Z", {
      title: "Family Storytime",
      geom: anywhere,
    });
    const carnival = oneOff("firemens-carnival", "2030-01-05T22:00:00.000Z", {
      title: "Firemen's Carnival",
      geom: anywhere,
    });
    const concert = oneOff("winter-concert", "2030-01-06T19:00:00.000Z", {
      title: "Winter Concert",
      category: "music",
      geom: anywhere,
    });
    const market = oneOff("makers-market", "2030-01-05T14:00:00.000Z", {
      title: "Makers Market",
      category: "market",
      geom: anywhere,
    });
    const nextWeekend = oneOff("next-weekend-fair", "2030-01-12T15:00:00.000Z", {
      title: "County Fair",
      geom: anywhere,
    });
    // A weekday event: its weekend is the one coming up.
    const wednesday = oneOff("wednesday-talk", "2030-01-02T23:00:00.000Z", {
      venue_name: "Weinberg Center for the Arts",
      venue_place_slug: "weinberg-center",
    });

    const result = buildRelatedEventSections(wednesday, now, [
      storytime,
      carnival,
      concert,
      market,
      nextWeekend,
      walkingGroup,
    ]);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toMatchObject({ kind: "weekend", title: "Also this weekend" });
    expect(result.sections[0]?.items.map((row) => row.slug)).toEqual([
      "makers-market",
      "firemens-carnival",
      "winter-concert",
    ]);
  });

  it("names a later weekend by its Friday instead of calling it this weekend", () => {
    const later = oneOff("mid-january-show", "2030-01-16T23:00:00.000Z", {
      geo_confidence: "area",
    });
    const saturday = oneOff("saturday-fair", "2030-01-19T15:00:00.000Z", {
      title: "Winter Fair",
      geom: { lng: -77.35, lat: 39.48 },
    });
    const result = buildRelatedEventSections(later, now, [saturday]);
    expect(result.sections[0]).toMatchObject({
      kind: "weekend",
      title: "Also the weekend of January 18",
    });
  });

  it("skips the same-night search when the event's own pin is approximate", () => {
    const vagueShow = { ...show, geo_confidence: "area" as const };
    const close = oneOff("jazz-at-the-cellar", "2030-01-06T00:00:00.000Z", { geom: north(500) });
    const result = buildRelatedEventSections(vagueShow, now, [close]);
    expect(result.sections.map((section) => section.kind)).toEqual(["weekend"]);
  });
});

describe("relatedWeekendWindow", () => {
  it("contains a weekend event and anchors a past event on now", () => {
    const now = new Date("2030-01-01T12:00:00.000Z");
    const saturday = relatedWeekendWindow({ starts_at: "2030-01-06T01:00:00.000Z" }, now);
    expect(new Date(saturday.startMs).toISOString()).toBe("2030-01-04T22:00:00.000Z");
    expect(new Date(saturday.endMs).toISOString()).toBe("2030-01-07T05:00:00.000Z");
    expect(saturday.isCurrent).toBe(true);
    const past = relatedWeekendWindow({ starts_at: "2029-12-01T01:00:00.000Z" }, now);
    expect(past.startMs).toBe(saturday.startMs);
  });
});
