import { describe, expect, it } from "vitest";
import type { Event } from "@/data/events";
import {
  isStrongTodayEvent,
  selectTodayEvents,
  shouldRenderTodayEventSection,
} from "./today-events";

const now = new Date("2026-07-16T17:45:00.000Z"); // 1:45 PM Eastern

function event(overrides: Partial<Event> & Pick<Event, "slug" | "title">): Event {
  const { slug, title, ...rest } = overrides;
  return {
    slug,
    title,
    description: "A real local event.",
    starts_at: "2026-07-16T23:00:00.000Z",
    ends_at: "2026-07-17T01:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "A real venue",
    address: "Frederick, MD",
    geom: { lng: -77.4105, lat: 39.4143 },
    municipality: "frederick",
    category: "music",
    audience: [],
    is_free: false,
    source: "manual",
    is_verified: true,
    ...rest,
  };
}

describe("Today event shortlist", () => {
  it("rejects the bad all-day nighttime label and venue-less noise", () => {
    expect(isStrongTodayEvent(event({
      slug: "night-bingo",
      title: "Thursday Night Bingo",
      is_all_day: true,
      starts_at: "2026-07-16T04:00:00.000Z",
      ends_at: "2026-07-17T03:59:00.000Z",
    }), now)).toBe(false);
    expect(isStrongTodayEvent(event({
      slug: "mystery-act",
      title: "Mystery Act",
      venue_name: "",
    }), now)).toBe(false);
  });

  it("builds a useful now, later, tonight sequence", () => {
    const result = selectTodayEvents([
      event({ slug: "live", title: "Lunch Concert", starts_at: "2026-07-16T17:00:00.000Z", ends_at: "2026-07-16T18:30:00.000Z" }),
      event({ slug: "later", title: "Afternoon Art", starts_at: "2026-07-16T19:00:00.000Z", ends_at: "2026-07-16T20:00:00.000Z", category: "arts" }),
      event({ slug: "tonight", title: "Evening Concert", starts_at: "2026-07-16T23:00:00.000Z", ends_at: "2026-07-17T01:00:00.000Z" }),
    ], now);
    expect(result.map((item) => item.moment)).toEqual(["Now", "Later", "Tonight"]);
  });

  it("carries enough sourced detail to restore a Carroll Creek feature", () => {
    const [festival] = selectTodayEvents([
      event({
        slug: "black-frederick-festival-2026-08-22",
        title: "Black Frederick Festival",
        description:
          "A community celebration with performances, food, vendors, and activities.",
        starts_at: "2026-07-16T17:00:00.000Z",
        ends_at: "2026-07-16T22:00:00.000Z",
        venue_place_slug: "carroll-creek-outdoor-amphitheater",
        venue_name: "Carroll Creek Outdoor Amphitheater",
        address: "50 Carroll Creek Way, Frederick, MD 21701",
        source: "dfp",
        source_url: "https://downtownfrederick.org/events/black-frederick-festival",
        is_free: false,
      }),
    ], now);

    expect(festival).toMatchObject({
      title: "Black Frederick Festival",
      moment: "Now",
      highlight: true,
      when: "Thu, Jul 16 · 1:00 PM–6:00 PM",
      admission: "Not listed by the event source",
      sourceLabel: "Downtown Frederick Partnership",
      sourceUrl: "https://downtownfrederick.org/events/black-frederick-festival",
    });
  });

  it("trusts an official publisher row without pretending Radius verified it", () => {
    const official = event({
      slug: "library-concert",
      title: "Library Concert",
      source: "fcpl",
      is_verified: false,
    });
    const aggregator = event({
      slug: "unknown-feed-concert",
      title: "Unknown Feed Concert",
      source: "eventbrite",
      is_verified: false,
    });

    expect(isStrongTodayEvent(official, now)).toBe(true);
    expect(official.is_verified).toBe(false);
    expect(isStrongTodayEvent(aggregator, now)).toBe(false);
  });

  it("hides an empty degraded section but keeps trustworthy empty-day copy", () => {
    expect(shouldRenderTodayEventSection({
      degraded: true,
      featurePromoted: false,
      programCount: 0,
      earlierCount: 0,
    })).toBe(false);
    expect(shouldRenderTodayEventSection({
      degraded: false,
      featurePromoted: false,
      programCount: 0,
      earlierCount: 0,
    })).toBe(true);
    expect(shouldRenderTodayEventSection({
      degraded: true,
      featurePromoted: false,
      programCount: 1,
      earlierCount: 0,
    })).toBe(true);
  });
});
