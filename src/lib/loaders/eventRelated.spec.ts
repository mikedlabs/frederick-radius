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
});
