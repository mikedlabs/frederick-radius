import { describe, expect, it } from "vitest";
import type { Event } from "@/data/events";
import { isStrongTodayEvent, selectTodayEvents } from "./today-events";

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
});
