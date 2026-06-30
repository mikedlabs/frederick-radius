/**
 * Event intent taxonomy — the SMARTER main/sub model for /events. Asserts the
 * category→intent roll-up (incl. the honest "community" fallback), the tucked
 * civic lane, and the composable sub-facets (free, audience, time-of-day,
 * recurring, groups) that all derive from existing fields.
 */
import { describe, it, expect } from "vitest";
import {
  EVENT_INTENTS,
  PRIMARY_INTENTS,
  intentForCategory,
  eventIntentOf,
  isFreeEvent,
  isRecurringEvent,
  isForGroups,
  isForKids,
  audienceMatches,
  eventDaypart,
  countByIntent,
  type FacetEvent,
} from "@/lib/events/intents";

describe("intentForCategory", () => {
  it("rolls draw categories up to their intent", () => {
    expect(intentForCategory("music")).toBe("music");
    expect(intentForCategory("gallery")).toBe("arts");
    expect(intentForCategory("theater")).toBe("arts");
    expect(intentForCategory("brewery")).toBe("food");
    expect(intentForCategory("market")).toBe("food");
    expect(intentForCategory("library")).toBe("family");
    expect(intentForCategory("sports")).toBe("sports");
    expect(intentForCategory("trail")).toBe("outdoors");
  });

  it("sends civic/government categories to the tucked civic lane", () => {
    expect(intentForCategory("civic")).toBe("civic");
    expect(intentForCategory("government")).toBe("civic");
    expect(intentForCategory("voting")).toBe("civic");
  });

  it("falls back to community for unknown or empty categories", () => {
    expect(intentForCategory("")).toBe("community");
    expect(intentForCategory(undefined)).toBe("community");
    expect(intentForCategory("something-new")).toBe("community");
    expect(intentForCategory("community")).toBe("community");
    expect(intentForCategory("wellness")).toBe("community");
  });

  it("exposes seven primary intents (civic is tucked out of the rail)", () => {
    expect(PRIMARY_INTENTS).toHaveLength(7);
    expect(PRIMARY_INTENTS.map((i) => i.id)).not.toContain("civic");
    expect(EVENT_INTENTS.find((i) => i.id === "civic")?.tucked).toBe(true);
  });

  it("every category in every intent is unique (no slug in two intents)", () => {
    const seen = new Set<string>();
    for (const intent of EVENT_INTENTS) {
      for (const c of intent.categories) {
        expect(seen.has(c), `${c} mapped twice`).toBe(false);
        seen.add(c);
      }
    }
  });
});

describe("composable sub-facets", () => {
  const base: FacetEvent = {
    category: "music",
    is_free: true,
    audience: ["kids-6-12", "adults", "groups"],
    starts_at: "2026-07-01T23:00:00.000Z", // 7pm ET → evening
    is_recurring: true,
  };

  it("reads free / recurring / groups / kids from existing fields", () => {
    expect(isFreeEvent(base)).toBe(true);
    expect(isFreeEvent({ ...base, is_free: false })).toBe(false);
    expect(isRecurringEvent(base)).toBe(true);
    expect(isForGroups(base)).toBe(true);
    expect(isForGroups({ ...base, audience: ["adults"] })).toBe(false);
    expect(isForKids(base)).toBe(true);
    expect(isForKids({ ...base, audience: ["adults"] })).toBe(false);
    expect(audienceMatches(base, "kids-6-12")).toBe(true);
    expect(audienceMatches(base, "kids-0-5")).toBe(false);
  });

  it("buckets an event's start into an Eastern time-of-day", () => {
    expect(eventDaypart({ starts_at: "2026-07-01T13:00:00.000Z" })).toBe("morning"); // 9am ET
    expect(eventDaypart({ starts_at: "2026-07-01T23:00:00.000Z" })).toBe("evening"); // 7pm ET
    expect(eventDaypart({})).toBeNull();
    expect(eventDaypart({ starts_at: "not-a-date" })).toBeNull();
  });

  it("a facet composes with an intent (free music for kids)", () => {
    const e = base;
    expect(eventIntentOf(e)).toBe("music");
    const matches = eventIntentOf(e) === "music" && isFreeEvent(e) && isForKids(e);
    expect(matches).toBe(true);
  });

  it("countByIntent tallies a mixed set", () => {
    const set: FacetEvent[] = [
      { category: "music" },
      { category: "music" },
      { category: "gallery" },
      { category: "brewery" },
      { category: "civic" },
      { category: "" }, // → community
    ];
    const counts = countByIntent(set);
    expect(counts.music).toBe(2);
    expect(counts.arts).toBe(1);
    expect(counts.food).toBe(1);
    expect(counts.civic).toBe(1);
    expect(counts.community).toBe(1);
    expect(counts.sports).toBe(0);
  });
});
