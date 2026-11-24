import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { FROSTY_FRIDAY, TENTH_WARD_CONCERT } from "@/data/thanksgiving-events";
import { downtownFeatureForToday, downtownGuide, downtownGuideForDate, downtownGuideForVisit, weekendGuide } from "./local-outing-guides";

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
    expect(downtownGuide.note).toContain("Sunday, 11 AM–1 PM");
    expect(downtownGuide.stops.map(stop => stop.suggestedMinutes)).toEqual([undefined, 20, 40, 45]);
    expect(downtownGuide.route.allowance).toMatch(/2 hours.*15 minutes/);
    expect(downtownGuide.route.firstAction.label).toContain("East All Saints");
    expect(downtownGuide.route.firstAction.href).toContain("destination=39.4118117,-77.4072907");
    expect(downtownGuide.stops[0].price).toContain("Free Sundays, 8 AM–2 PM");
    expect(downtownGuide.stops[0].action.href).toContain("/Garage-Parking");
    expect(downtownGuide.stops[2].when).toContain("Sun, 11 AM–5 PM");
    expect(downtownGuide.note).toContain("Nov 24, 2026");
    expect(downtownGuide.stops.every((stop) => new URL(stop.source.href).protocol === "https:")).toBe(true);
  });

  it("keeps the complete route and ordinary parking before the holiday starts in Frederick", () => {
    const wednesday = downtownGuideForDate(new Date("2026-11-26T04:59:59Z"));
    expect(wednesday.stops).toEqual(downtownGuide.stops);
    expect(wednesday.route).toEqual(downtownGuide.route);
    expect(wednesday.notice?.heading).toContain("Thu, Nov 26");
    expect(wednesday.notice?.sources.map(source => source.href)).toContain(downtownGuide.stops[1].source.href);
  });

  it("keeps closed venues outside the walking route for the holiday and restores them at Eastern midnight", () => {
    for (const iso of ["2026-11-26T05:00:00Z", "2026-11-27T04:59:59Z"]) {
      const holiday = downtownGuideForDate(new Date(iso));
      expect(holiday.title).toBe("Thanksgiving Creek Walk");
      expect(holiday.notice?.text).toContain("Visitor Center and Delaplaine galleries close");
      expect(holiday.notice?.sources).toHaveLength(3);
      expect(holiday.stops.map(stop => stop.title)).toEqual([downtownGuide.stops[0].title, downtownGuide.stops[3].title]);
      expect(holiday.route.allowance).toMatch(/1 hour.*15 minutes/);
      expect(holiday.stops[1].suggestedMinutes).toBe(45);
      expect(holiday.route.firstAction.href).toContain("travelmode=driving");
      expect(holiday.stops[1].detail).not.toContain("Visitor Center");
    }
    const nextDay = downtownGuideForDate(new Date("2026-11-27T05:00:00Z"));
    expect(nextDay.notice).toBeUndefined();
    expect(nextDay.stops).toHaveLength(4);
    expect(nextDay.stops[0].price).toContain("Free Thu, Nov 26 through Sun, Nov 29");
    expect(downtownGuideForDate(new Date("2026-11-30T05:00:00Z"))).toBe(downtownGuide);
  });

  it("offers the correct day after the last daytime start and opens the same dated holiday route", () => {
    const afternoon = new Date("2026-11-25T20:05:00Z");
    expect(downtownFeatureForToday(new Date("2026-11-25T19:59:59Z")).downtownWhen).toBe("Daytime walk");
    const feature = downtownFeatureForToday(afternoon);
    expect(feature).toMatchObject({ downtownWhen: "Tomorrow", downtownTitle: "Thanksgiving Creek Walk" });
    const selected = new URL(feature.downtownHref, "https://frederickradius.app").searchParams.get("day")!;
    expect(downtownGuideForVisit(afternoon, selected)).toMatchObject({ title: feature.downtownTitle, scopeLabel: "Downtown Frederick · Thu, Nov 26" });
    for (const invalid of ["yesterday", "2026-11-24", "2027-01-01", ["2026-11-26", "2026-11-25"]]) {
      expect(downtownGuideForVisit(afternoon, invalid).title).toBe("Two Hours Downtown");
    }
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
    expect(guide.stops[0].visitTip).toContain("5:20 PM");
    expect(guide.stops[1].visitTip).toContain("Willow Oaks");
    expect(guide.stops[2].photo?.credit?.license.label).toBe("CC BY-SA 4.0");
  });

  it("retires ended sessions while preserving the upcoming Sunday occurrence", () => {
    const saturdayEvening = weekendGuide(new Date("2026-11-21T22:00:00Z"));
    expect(saturdayEvening.stops.map((stop) => stop.when)).toEqual([
      "Sat or Sun · After 5:20 PM",
      "Sun, Nov 22 · 10 AM–5 PM",
      "Sat, Nov 21 · 8 PM",
    ]);
    expect(weekendGuide(new Date("2026-11-22T01:00:00Z")).stops.map((stop) => stop.title)).toEqual([
      "See the lighted boats after dark",
      "Valley Craft Network Studio Tour",
    ]);
    expect(weekendGuide(new Date("2026-11-22T22:00:00Z")).stops.map((stop) => stop.when)).toEqual(["Sun · After 5:20 PM"]);
    expect(weekendGuide(new Date("2026-11-23T03:00:00Z")).stops).toEqual([]);
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
    expect(after.stops.map(stop => [stop.title, stop.when])).toEqual([
      [FROSTY_FRIDAY.title, "Fri, Nov 27 · 9 AM–9 PM"],
      [TENTH_WARD_CONCERT.title, "Fri, Nov 27 · 8–10 PM"],
    ]);
    expect(weekendGuide(new Date("2026-11-30T05:00:00Z")).summary).toContain("any confirmed guide picks");
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

    expect(guide.stops).toHaveLength(3);
    expect(guide.stops[2]).toMatchObject({
      title: "Frosty Friday Concert",
      when: "Fri, Nov 27 · 8:00 PM–9:00 PM",
      source: { label: "Weinberg Center for the Arts", href: "https://example.com/event" },
      action: { href: "https://example.com/event" },
    });
    expect(guide.stops[2].detail).toBeUndefined();
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

    expect(guide.stops.map((stop) => stop.title)).toEqual([FROSTY_FRIDAY.title, TENTH_WARD_CONCERT.title, "Frosty Friday Concert"]);
  });

  it("retires holiday picks at their published ends and honors a notice under the syndicated URL", () => {
    const duplicate = event({ title: "Live Music at Tenth Ward", source_url: TENTH_WARD_CONCERT.syndicatedUrl });
    expect(weekendGuide(new Date("2026-11-27T20:00:00Z"), [duplicate]).stops).toHaveLength(2);
    expect(weekendGuide(new Date("2026-11-28T02:00:00Z")).stops.map(stop => stop.title)).toEqual([TENTH_WARD_CONCERT.title]);
    expect(weekendGuide(new Date("2026-11-28T03:00:00Z")).stops).toEqual([]);
    expect(weekendGuide(new Date("2026-11-27T20:00:00Z"), [{ ...duplicate, status: "postponed" }]).stops.map(stop => stop.title)).toEqual([FROSTY_FRIDAY.title]);
  });
});
