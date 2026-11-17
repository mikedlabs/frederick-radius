import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { downtownGuide, weekendGuide } from "./local-outing-guides";

function event(overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "verified-outing",
    title: "Frosty Friday Concert",
    description: "Hear local musicians in downtown Frederick.",
    starts_at: "2026-11-28T01:00:00Z",
    ends_at: "2026-11-28T02:00:00Z",
    timezone: "America/New_York",
    venue_name: "Test Theater",
    address: "1 Test St",
    geom: { lat: 39.414, lng: -77.411 },
    municipality: "frederick",
    municipality_name: "Frederick",
    category: "music",
    category_name: "Music",
    audience: [],
    is_free: false,
    source: "weinberg",
    source_url: "https://example.com/event",
    is_verified: true,
    source_id: "verified-outing",
    license: "test",
    confidence: "verified",
    first_seen_at: "2026-11-21T18:00:00Z",
    last_verified_at: "2026-11-22T19:00:00Z",
    geo_confidence: "venue_match",
    attendance_mode: "physical",
    ...overrides,
  };
}

describe("local outing guides", () => {
  it("links to the sources for a fixed two-hour downtown route", () => {
    expect(downtownGuide.title).toBe("Two Hours Downtown");
    expect(downtownGuide.stops.map((stop) => stop.title)).toEqual([
      "Park at East All Saints",
      "Frederick Visitor Center",
      "The Delaplaine Arts Center",
      "Carroll Creek and Community Bridge",
    ]);
    expect(downtownGuide.stops[1].detail).toContain("accessible restroom");
    expect(downtownGuide.stops[2].when).toContain("Sun, 11 AM–5 PM");
    expect(downtownGuide.note).toContain("Nov 16, 2026");
    expect(downtownGuide.stops.every((stop) => new URL(stop.source.href).protocol === "https:")).toBe(true);
  });

  it("publishes the three Sunday and Saturday picks with their source and checked date", () => {
    const guide = weekendGuide(new Date("2026-11-16T20:00:00Z"));

    expect(guide.title).toBe("This Weekend");
    expect(guide.scopeLabel).toMatch(/Whole county · Nov 21\s*–\s*22/);
    expect(guide.stops.map((stop) => stop.title)).toEqual([
      "Sailing Through the Winter Solstice launch",
      "Valley Craft Network Studio Tour",
      "A Motown Christmas",
    ]);
    expect(guide.stops[0].when).toBe("Sat, Nov 21 · 8–11 AM");
    expect(guide.stops[1].when).toContain("Sun, Nov 22 · 10 AM–5 PM");
    expect(guide.stops[2].source.href).toBe("https://weinbergcenter.org/shows/a-motown-christmas-2026/");
    expect(guide.note).toContain("Nov 16, 2026");
    expect(guide.photo.src).toBe("/images/seasons/winter/WINTER BOATS.jpg");
    expect(guide.photoCaption).toContain("January 2022");
    expect(guide.stops[0].price).toBe("Free admission");
    expect(guide.stops[2].photo?.credit?.license.label).toBe("CC BY-SA 4.0");
  });

  it("retires ended sessions while preserving the upcoming Sunday occurrence", () => {
    const saturdayEvening = weekendGuide(new Date("2026-11-21T22:00:00Z"));
    expect(saturdayEvening.stops.map((stop) => stop.when)).toEqual([
      "Sun, Nov 22 · 10 AM–5 PM",
      "Sat, Nov 21 · 8 PM",
    ]);
    expect(weekendGuide(new Date("2026-11-22T01:00:00Z")).stops.map((stop) => stop.title)).toEqual([
      "Valley Craft Network Studio Tour",
    ]);
    expect(weekendGuide(new Date("2026-11-22T22:00:00Z")).stops).toEqual([]);
  });

  it("honors a canonical cancellation without removing a different day's session", () => {
    const guide = weekendGuide(new Date("2026-11-18T20:00:00Z"), [event({
      title: "Valley Craft Network Studio Tour",
      status: "cancelled",
      starts_at: "2026-11-21T15:00:00Z",
    })]);

    expect(guide.stops.find((stop) => stop.title === "Valley Craft Network Studio Tour")?.when)
      .toBe("Sun, Nov 22 · 10 AM–5 PM");
  });

  it("rolls over at Eastern midnight and keeps a calendar path when there are no confirmed picks", () => {
    const before = weekendGuide(new Date("2026-11-23T04:59:59Z"));
    const after = weekendGuide(new Date("2026-11-23T05:00:00Z"));

    expect(before.scopeLabel).toMatch(/Nov 21\s*–\s*22/);
    expect(after.scopeLabel).toMatch(/Nov 27\s*–\s*29/);
    expect(after.photo.src).toBe("/images/places/church-street-sunset.jpg");
    expect(after.stops).toEqual([]);
    expect(after.summary).toContain("any confirmed guide picks");
    expect(after.secondaryAction?.href).toBe("/events?in=county&lens=weekend");
  });

  it("uses only usable canonical listings and shows Friday events with their Eastern date", () => {
    const guide = weekendGuide(new Date("2026-11-23T15:00:00Z"), [
      event(),
      event({ slug: "second-performance", starts_at: "2026-11-28T22:00:00Z", ends_at: "2026-11-28T23:00:00Z" }),
      event({ slug: "stale", title: "Stale concert", last_verified_at: "2026-11-15T00:00:00Z" }),
      event({ slug: "cancelled", title: "Cancelled concert", status: "cancelled" }),
      event({ slug: "feed", title: "Feed-only concert", source_url: "https://example.com/events.ics" }),
      event({ slug: "online", title: "Online tour", attendance_mode: "online" }),
      event({ slug: "routine", title: "Toddler Storytime" }),
      event({ slug: "other-week", title: "Next week's concert", starts_at: "2026-12-05T01:00:00Z" }),
      event({ slug: "invalid", title: "Concert with no date", starts_at: "invalid" }),
    ]);

    expect(guide.stops).toHaveLength(1);
    expect(guide.stops[0]).toMatchObject({
      title: "Frosty Friday Concert",
      when: "Fri, Nov 27 · 8:00 PM–9:00 PM",
      source: { label: "Weinberg Center for the Arts", href: "https://example.com/event" },
      action: { href: "https://example.com/event" },
    });
    expect(guide.stops[0].detail).toBeUndefined();
  });

  it("does not recommend a started timed event with an unknown end", () => {
    const now = new Date("2026-11-28T01:30:00Z");
    const recentlyChecked = { last_verified_at: "2026-11-27T17:00:00Z" };
    const guide = weekendGuide(now, [
      event(recentlyChecked),
      event({
        ...recentlyChecked,
        slug: "unknown-end",
        title: "Unknown end time concert",
        ends_at: "2026-11-28T01:00:00Z",
      }),
    ]);

    expect(guide.stops.map((stop) => stop.title)).toEqual(["Frosty Friday Concert"]);
  });
});
