import { describe, expect, it } from "vitest";
import type { Event } from "@/data/events";
import { eventTimeCaution } from "@/lib/events/decision-facts";
import {
  eventDateHeroPlates,
  eventDetailDays,
  eventDetailTimeCaution,
  eventGlanceGettingIn,
  eventGlanceParking,
  eventGlanceWhen,
  eventGuideMoment,
  eventMapCaption,
} from "./eventDetailFacts";

const base: Event = {
  slug: "evening-concert",
  title: "Evening concert",
  description: "A public concert.",
  starts_at: "2026-10-08T19:30:00-04:00",
  ends_at: "2026-10-08T22:00:00-04:00",
  timezone: "America/New_York",
  venue_name: "Weinberg Center",
  address: "20 W Patrick Street",
  geom: { lng: -77.4126, lat: 39.4142 },
  municipality: "frederick",
  category: "music",
  audience: [],
  is_free: false,
  source: "manual",
  source_url: "https://example.org/concert",
  is_verified: true,
};

const colorfest: Event = {
  ...base,
  slug: "catoctin-colorfest-thurmont-2026",
  title: "Catoctin Colorfest",
  starts_at: "2026-10-10T09:00:00-04:00",
  ends_at: "2026-10-11T17:00:00-04:00",
  is_free: true,
};

const at = (iso: string) => new Date(iso);

describe("eventDetailDays", () => {
  it("covers only the start day for an outing that runs past midnight", () => {
    const late = { ...base, starts_at: "2026-10-09T21:00:00-04:00", ends_at: "2026-10-10T01:30:00-04:00" };
    expect(eventDetailDays(late).map((d) => d.date)).toEqual(["2026-10-09"]);
  });

  it("lists each day of a multi-day event", () => {
    expect(eventDetailDays(colorfest).map((d) => d.date)).toEqual(["2026-10-10", "2026-10-11"]);
  });

  it("treats an all-day end as exclusive", () => {
    const market = {
      ...base,
      is_all_day: true,
      starts_at: "2026-10-10T00:00:00-04:00",
      ends_at: "2026-10-12T00:00:00-04:00",
    };
    expect(eventDetailDays(market).map((d) => d.date)).toEqual(["2026-10-10", "2026-10-11"]);
  });

  it("prints the two ends of a long run instead of a plate per day", () => {
    const exhibit = { ...base, starts_at: "2026-10-01T12:00:00-04:00", ends_at: "2026-10-31T17:00:00-04:00" };
    const hero = eventDateHeroPlates(exhibit);
    expect(hero.range).toBe(true);
    expect(hero.plates.map((d) => d.date)).toEqual(["2026-10-01", "2026-10-31"]);
    expect(eventDateHeroPlates(colorfest)).toMatchObject({ range: false });
  });
});

describe("eventGlanceWhen", () => {
  it("says Tonight with the start and the listed end", () => {
    expect(eventGlanceWhen(base, at("2026-10-08T12:00:00-04:00"))).toEqual({
      value: "Tonight, 7:30 PM",
      support: "Until 10:00 PM",
    });
  });

  it("says Today for a daytime start and Tomorrow for the next day", () => {
    const matinee = { ...base, starts_at: "2026-10-08T14:00:00-04:00", ends_at: "2026-10-08T16:00:00-04:00" };
    expect(eventGlanceWhen(matinee, at("2026-10-08T09:00:00-04:00"))?.value).toBe("Today, 2:00 PM");
    expect(eventGlanceWhen(base, at("2026-10-07T20:00:00-04:00"))?.value).toBe("Tomorrow, 7:30 PM");
  });

  it("names the date further out and never invents an end", () => {
    const noEnd = { ...base, ends_at: base.starts_at };
    expect(eventGlanceWhen(noEnd, at("2026-10-01T12:00:00-04:00"))).toEqual({
      value: "Thu Oct 8, 7:30 PM",
      support: null,
    });
    expect(eventGlanceWhen(noEnd, at("2026-10-08T12:00:00-04:00"))).toEqual({
      value: "Tonight, 7:30 PM",
      support: "Thu Oct 8",
    });
  });

  it("states a multi-day event's days and its listed clocks", () => {
    expect(eventGlanceWhen(colorfest, at("2026-10-08T12:00:00-04:00"))).toEqual({
      value: "Sat Oct 10 and Sun Oct 11",
      support: "Starts 9:00 AM, ends 5:00 PM Sun",
    });
  });

  it("gives a range listing's anchor no clock", () => {
    const exhibit = { ...base, starts_at: "2026-10-01T12:00:00-04:00", ends_at: "2026-10-31T17:00:00-04:00" };
    expect(eventGlanceWhen(exhibit, at("2026-10-08T12:00:00-04:00"))).toEqual({
      value: "Thu Oct 1 to Sat Oct 31",
      support: null,
    });
  });

  it("marks all-day and date-only listings without a clock", () => {
    const allDay = {
      ...base,
      is_all_day: true,
      starts_at: "2026-10-10T00:00:00-04:00",
      ends_at: "2026-10-11T00:00:00-04:00",
    };
    expect(eventGlanceWhen(allDay, at("2026-10-08T12:00:00-04:00"))).toEqual({
      value: "Sat Oct 10",
      support: "All day",
    });
    const dateOnly = { ...base, starts_at: "2026-10-10T12:00:00-04:00", ends_at: "2026-10-10T23:59:00-04:00" };
    expect(eventGlanceWhen(dateOnly, at("2026-10-08T12:00:00-04:00"))).toEqual({
      value: "Sat Oct 10",
      support: "Start time not listed",
    });
  });
});

describe("eventGlanceGettingIn", () => {
  it("says Free, a listed price, or Tickets, and nothing otherwise", () => {
    expect(eventGlanceGettingIn({ is_free: true })).toEqual({ value: "Free", support: null });
    expect(
      eventGlanceGettingIn({ is_free: false, price_text: "$25", ticket_url: "https://t.example/1" }),
    ).toEqual({ value: "$25", support: "Tickets sold online" });
    expect(eventGlanceGettingIn({ is_free: false, ticket_url: "https://t.example/1" })).toEqual({
      value: "Tickets",
      support: "Price not listed",
    });
    expect(eventGlanceGettingIn({ is_free: false, price_text: "  " })).toBeNull();
  });
});

describe("eventGlanceParking", () => {
  const garage = { slug: "court-street-garage", name: "Court Street Garage", distanceM: 88, distanceLabel: "0.2 mi" };

  it("prints the nearest garage with its straight-line distance", () => {
    expect(eventGlanceParking({ parkingDecision: garage })).toEqual({
      value: "Court Street Garage",
      support: "0.2 mi, straight line",
    });
  });

  it("prefers a short venue note in its own words, with its checked date", () => {
    expect(
      eventGlanceParking({
        fieldNote: {
          text: "No dedicated lot. The closest public garage is Carroll Creek Garage.",
          last_verified: "2026-06-15",
        },
        parkingDecision: garage,
      }),
    ).toEqual({ value: "No dedicated lot", support: "Checked Jun 15, 2026" });
  });

  it("shows no tile when the note's opening is long or is not about parking", () => {
    expect(
      eventGlanceParking({
        fieldNote: { text: "Bushwaller's is at 209 N Market St, in the 200 block downtown. Garages nearby." },
        parkingDecision: garage,
      }),
    ).toBeNull();
    expect(
      eventGlanceParking({
        fieldNote: {
          text: "Park at the Church Street parking garage (17 E Church St) - it sits directly behind the pub.",
        },
        parkingDecision: garage,
      }),
    ).toBeNull();
    expect(eventGlanceParking({ parkingDecision: null })).toBeNull();
  });
});

describe("eventDetailTimeCaution", () => {
  it("says what Radius has not confirmed for a multi-day listing with no source link", () => {
    const unsourced = { ...colorfest, source_url: null };
    expect(eventDetailTimeCaution(unsourced, eventTimeCaution(unsourced))).toBe(
      "This listing spans several days. Hours can change by day, and Radius has not confirmed them.",
    );
  });

  it("passes every other caution through unchanged", () => {
    const noEnd = { ...base, ends_at: base.starts_at, source_url: null };
    expect(eventDetailTimeCaution(noEnd, eventTimeCaution(noEnd))).toBe(
      "The publisher has not listed an end time.",
    );
    expect(eventDetailTimeCaution(base, eventTimeCaution(base))).toBeNull();
  });

  it("keeps pointing to the event page when there is one", () => {
    expect(eventDetailTimeCaution(colorfest, eventTimeCaution(colorfest))).toBe(
      "This listing spans several days. Check the event page for individual dates and opening hours.",
    );
  });
});

describe("eventGuideMoment", () => {
  it("links Colorfest's guide until its window ends", () => {
    expect(eventGuideMoment(colorfest.slug, at("2026-10-08T12:00:00-04:00"))?.slug).toBe(
      "catoctin-colorfest-2026",
    );
    expect(eventGuideMoment(colorfest.slug, at("2026-10-11T22:00:00-04:00"))?.slug).toBe(
      "catoctin-colorfest-2026",
    );
    expect(eventGuideMoment(colorfest.slug, at("2026-10-12T08:00:00-04:00"))).toBeNull();
    expect(eventGuideMoment(base.slug, at("2026-10-08T12:00:00-04:00"))).toBeNull();
  });
});

describe("eventMapCaption", () => {
  it("names the venue and its street", () => {
    expect(
      eventMapCaption({
        venueName: "Thurmont Community Park",
        address: "19 Frederick Rd, Thurmont, MD 21788",
        geom: { lng: -77.4127594, lat: 39.6213 },
      }),
    ).toBe("Thurmont Community Park, Frederick Rd");
  });

  it("adds a nearby landmark and falls back to the venue without a street", () => {
    expect(
      eventMapCaption({
        venueName: "Weinberg Center",
        address: "20 W Patrick Street",
        geom: { lng: -77.4124, lat: 39.4145 },
      }),
    ).toBe("Weinberg Center, West Patrick Street, near Carroll Creek");
    expect(
      eventMapCaption({ venueName: "Baker Park", address: "Frederick, MD", geom: { lng: -77.42, lat: 39.417 } }),
    ).toBe("Baker Park");
  });
});
