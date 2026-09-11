import { describe, expect, it } from "vitest";
import type { Event } from "@/data/events";
import { qualifiedSearch, search } from "@/lib/search";
import { searchEventWindow } from "./eventWindow";

const now = new Date("2026-09-06T16:00:00Z");
function event(slug: string, start: string, end: string, patch: Partial<Event> = {}): Event {
  return {
    slug, title: `Jazz ${slug}`, description: "A live jazz performance.",
    starts_at: start, ends_at: end, timezone: "America/New_York",
    venue_name: "Local stage", address: "1 Main St", municipality: "brunswick",
    geom: { lat: 39.3134, lng: -77.628 }, category: "music", audience: [],
    is_free: true, source: "manual", is_verified: true, ...patch,
  };
}
const tonight = event("tonight", "2026-09-06T23:00:00Z", "2026-09-07T01:00:00Z");
const tomorrow = event("tomorrow", "2026-09-07T23:00:00Z", "2026-09-08T01:00:00Z");
const matinee = event("matinee", "2026-09-06T17:00:00Z", "2026-09-06T19:00:00Z");
const expired = event("past", "2026-09-05T23:00:00Z", "2026-09-06T01:00:00Z");
const nextWeekend = event("next-weekend", "2026-09-12T23:00:00Z", "2026-09-13T01:00:00Z");
const pool = [expired, tomorrow, nextWeekend, matinee, tonight];

describe("search event constraints", () => {
  it("excludes expired exact-name hits rather than merely downranking them", () => {
    expect(search("Jazz past", 50, [expired], { now }).some((hit) => hit.type === "event")).toBe(false);
  });

  it.each([
    ["events tonight", ["tonight"]],
    ["events tomorrow", ["tomorrow"]],
    ["events today", ["matinee", "tonight"]],
    ["events this weekend", ["matinee", "tonight"]],
    ["events next weekend", ["next-weekend"]],
    ["events on 2026-09-07", ["tomorrow"]],
  ])("applies %s as a hard occurrence window", (query, expected) => {
    const found = qualifiedSearch(query, 50, pool, { now }).hits.flatMap((hit) => hit.type === "event" ? [hit.event.slug] : []);
    expect(found.sort()).toEqual([...expected].sort());
  });

  it("combines town, date and admission without relaxing any of them", () => {
    const paid = { ...tonight, slug: "paid", is_free: false };
    const inFrederick = { ...tonight, slug: "frederick", municipality: "frederick" };
    const { hits, meta } = qualifiedSearch("free events in Brunswick tonight", 50,
      [...pool, paid, inFrederick], { now, municipality: "frederick" });
    expect(hits.flatMap((hit) => hit.type === "event" ? [hit.event.slug] : [])).toEqual(["tonight"]);
    expect(meta).toMatchObject({ scopeMunicipality: "brunswick", eventWindow: { label: "Tonight", freeOnly: true } });
  });

  it("does not invent an evening occurrence from an all-day or month-long listing", () => {
    const window = searchEventWindow("events tonight", now);
    expect(window.matches({ ...tonight, is_all_day: true })).toBe(false);
    expect(window.matches({ ...tonight, starts_at: "2026-09-01T12:00:00Z", ends_at: "2026-09-30T23:00:00Z" })).toBe(false);
  });

  it("keeps an honest empty window empty", () => {
    const { hits } = qualifiedSearch("concerts tomorrow in Thurmont", 20, pool, { now });
    expect(hits.some((hit) => hit.type === "event")).toBe(false);
  });

  it("uses the local calendar at midnight and through daylight saving time", () => {
    const midnight = new Date("2026-11-01T04:30:00Z");
    const beforeClockChange = event("dst-early", "2026-11-01T05:00:00Z", "2026-11-01T05:45:00Z");
    const afterClockChange = event("dst-late", "2026-11-01T06:00:00Z", "2026-11-01T07:00:00Z");
    const window = searchEventWindow("events today", midnight);
    expect(window.matches(beforeClockChange)).toBe(true);
    expect(window.matches(afterClockChange)).toBe(true);
    expect(window.matches(event("next-day", "2026-11-02T05:30:00Z", "2026-11-02T06:30:00Z"))).toBe(false);
  });
});
