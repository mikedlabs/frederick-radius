import { describe, it, expect } from "vitest";
import {
  comingDay,
  comingDayWeatherSentence,
  isStillOnTonight,
  isTomorrowPreviewTime,
  selectComingDayEvents,
  tomorrowDaytimeForecast,
  type ComingDayCandidate,
} from "./tomorrow";
import type { NwsForecast, NwsHourly } from "@/lib/integrations/nws";

describe("isTomorrowPreviewTime — strictly gated on the Eastern clock", () => {
  it("is false through the day and evening (never leaks into daytime)", () => {
    expect(isTomorrowPreviewTime(new Date("2026-07-08T13:00:00.000Z"))).toBe(false); // 9 AM ET
    expect(isTomorrowPreviewTime(new Date("2026-07-08T23:00:00.000Z"))).toBe(false); // 7 PM ET
    expect(isTomorrowPreviewTime(new Date("2026-07-09T00:59:00.000Z"))).toBe(false); // 8:59 PM ET
  });

  it("turns on at 9 PM and stays on through the small hours", () => {
    expect(isTomorrowPreviewTime(new Date("2026-07-09T01:00:00.000Z"))).toBe(true); // 9:00 PM ET
    expect(isTomorrowPreviewTime(new Date("2026-07-09T01:30:00.000Z"))).toBe(true); // 9:30 PM ET
    expect(isTomorrowPreviewTime(new Date("2026-07-09T06:00:00.000Z"))).toBe(true); // 2:00 AM ET
  });
});

function daily(periods: Partial<NwsHourly>[]): NwsForecast {
  return { asOf: "", hourly: [], daily: periods as NwsHourly[] };
}

describe("tomorrowDaytimeForecast — the next day's daytime high, never guessed", () => {
  // Late on Jul 8 ET (11 PM), tomorrow is Jul 9.
  const now = new Date("2026-07-09T03:00:00.000Z");

  it("finds the daytime period whose Eastern day is tomorrow", () => {
    const wx = tomorrowDaytimeForecast(
      daily([
        { startTime: "2026-07-09T02:00:00-04:00", isDaytime: false, temperature: 68, shortForecast: "Clear" }, // tonight
        { startTime: "2026-07-09T08:00:00-04:00", isDaytime: true, temperature: 84, shortForecast: "Mostly Sunny" }, // tomorrow day
      ]),
      now,
    );
    expect(wx).toEqual({ temp: 84, shortForecast: "Mostly Sunny" });
  });

  it("returns null when no forecast reaches tomorrow (omit, don't fabricate)", () => {
    expect(tomorrowDaytimeForecast(null, now)).toBeNull();
    expect(
      tomorrowDaytimeForecast(
        daily([{ startTime: "2026-07-11T08:00:00-04:00", isDaytime: true, temperature: 90, shortForecast: "Sunny" }]),
        now,
      ),
    ).toBeNull();
  });

  it("ignores nighttime periods on tomorrow's date", () => {
    const wx = tomorrowDaytimeForecast(
      daily([{ startTime: "2026-07-09T20:00:00-04:00", isDaytime: false, temperature: 70, shortForecast: "Clear" }]),
      now,
    );
    expect(wx).toBeNull();
  });
});

describe("comingDay: the Eastern calendar day a person means", () => {
  it("is the next calendar day from 9 PM to midnight", () => {
    // 10:53 PM Tuesday Oct 6 (the audit render).
    const day = comingDay(new Date("2026-10-07T02:53:00.000Z"));
    expect(day.key).toBe("2026-10-07");
    expect(day.heading).toBe("Tomorrow, Wednesday");
    expect(day.laterToday).toBe(false);
    expect(new Date(day.startsAtMs).toISOString()).toBe("2026-10-07T09:00:00.000Z"); // 5 AM EDT
  });

  it("is today's date between midnight and 5 AM, not the day after", () => {
    // 1 AM Wednesday Oct 7: now plus 24 hours would have said Thursday.
    const day = comingDay(new Date("2026-10-07T05:00:00.000Z"));
    expect(day.key).toBe("2026-10-07");
    expect(day.heading).toBe("Later today, Wednesday");
    expect(day.laterToday).toBe(true);
    // 4:59 AM is still later today; 5:00 AM begins the day itself.
    expect(comingDay(new Date("2026-10-07T08:59:00.000Z")).heading).toBe("Later today, Wednesday");
    expect(comingDay(new Date("2026-10-07T09:00:00.000Z")).heading).toBe("Tomorrow, Thursday");
  });

  it("stays on the calendar across the fall DST change", () => {
    // 11:30 PM EDT Saturday Oct 31 2026; Sunday Nov 1 is 25 hours long.
    const day = comingDay(new Date("2026-11-01T03:30:00.000Z"));
    expect(day.key).toBe("2026-11-01");
    expect(day.heading).toBe("Tomorrow, Sunday");
    expect(new Date(day.startsAtMs).toISOString()).toBe("2026-11-01T10:00:00.000Z"); // 5 AM EST
    // 11:30 PM EST Saturday Mar 7 2026; Sunday Mar 8 is 23 hours long.
    const spring = comingDay(new Date("2026-03-08T04:30:00.000Z"));
    expect(spring.key).toBe("2026-03-08");
    expect(new Date(spring.startsAtMs).toISOString()).toBe("2026-03-08T09:00:00.000Z"); // 5 AM EDT
  });

  it("rolls the month and year", () => {
    expect(comingDay(new Date("2027-01-01T03:00:00.000Z")).key).toBe("2027-01-01"); // 10 PM Dec 31
  });
});

const VERIFIED_AT = "2026-10-06T20:00:00.000Z";
function listing(overrides: Partial<ComingDayCandidate> & { starts_at: string; title: string }): ComingDayCandidate & { slug: string } {
  return {
    slug: overrides.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    category: "community",
    confidence: "verified",
    source_url: "https://example.org/listing",
    last_verified_at: VERIFIED_AT,
    ...overrides,
  };
}

describe("isStillOnTonight", () => {
  const now = new Date("2026-10-07T02:53:00.000Z"); // 10:53 PM Oct 6

  it("keeps listings that are live or still ahead before the coming day starts", () => {
    expect(isStillOnTonight({ starts_at: "2026-10-07T03:00:00.000Z" }, now)).toBe(true); // 11 PM
    expect(isStillOnTonight({ starts_at: "2026-10-07T05:30:00.000Z" }, now)).toBe(true); // 1:30 AM
    expect(isStillOnTonight({
      starts_at: "2026-10-07T01:00:00.000Z", // 9 PM, live until midnight
      ends_at: "2026-10-07T04:00:00.000Z",
    }, now)).toBe(true);
  });

  it("drops wrapped-up, all-day and coming-day rows", () => {
    expect(isStillOnTonight({
      starts_at: "2026-10-06T22:00:00.000Z", // 6 PM to 8 PM
      ends_at: "2026-10-07T00:00:00.000Z",
    }, now)).toBe(false);
    expect(isStillOnTonight({
      starts_at: "2026-10-06T04:00:00.000Z",
      ends_at: "2026-10-07T04:00:00.000Z",
      is_all_day: true,
    }, now)).toBe(false);
    expect(isStillOnTonight({ starts_at: "2026-10-07T20:00:00.000Z" }, now)).toBe(false); // 4 PM tomorrow
  });
});

describe("selectComingDayEvents", () => {
  const now = new Date("2026-10-07T02:53:00.000Z"); // 10:53 PM Tuesday Oct 6

  it("lists up to three of tomorrow's verified rows in time order", () => {
    const rows = selectComingDayEvents([
      listing({ title: "Line Dancing", starts_at: "2026-10-07T23:30:00.000Z" }),
      listing({ title: "Bluegrass Jam", starts_at: "2026-10-07T23:00:00.000Z", category: "music" }),
      listing({ title: "Game Night", starts_at: "2026-10-07T20:00:00.000Z" }),
      listing({ title: "Storytime", starts_at: "2026-10-07T14:00:00.000Z", category: "family" }),
      listing({ title: "Tonight Show", starts_at: "2026-10-07T03:00:00.000Z" }),
      listing({ title: "Thursday Market", starts_at: "2026-10-08T14:00:00.000Z" }),
    ], now);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.starts_at.startsWith("2026-10-07T"))).toBe(true);
    expect(rows.map((row) => Date.parse(row.starts_at))).toEqual(
      rows.map((row) => Date.parse(row.starts_at)).sort((a, b) => a - b),
    );
    expect(rows.map((row) => row.title)).not.toContain("Tonight Show");
    expect(rows.map((row) => row.title)).not.toContain("Thursday Market");
  });

  it("applies Today's publisher verification gate, not only the utility filter", () => {
    const rows = selectComingDayEvents([
      listing({ title: "Unchecked Concert", starts_at: "2026-10-07T23:00:00.000Z", last_verified_at: null }),
      listing({ title: "Stale Check", starts_at: "2026-10-07T23:00:00.000Z", last_verified_at: "2026-10-01T12:00:00.000Z" }),
      listing({ title: "Feed Guess", starts_at: "2026-10-07T23:00:00.000Z", confidence: "scraped" }),
      listing({ title: "No Source", starts_at: "2026-10-07T23:00:00.000Z", source_url: null }),
      listing({ title: "Cancelled Show", starts_at: "2026-10-07T23:00:00.000Z", status: "cancelled" }),
      listing({ title: "Checked Concert", starts_at: "2026-10-07T23:30:00.000Z", category: "music" }),
    ], now);
    expect(rows.map((row) => row.title)).toEqual(["Checked Concert"]);
  });

  it("answers later today after midnight instead of skipping a day", () => {
    const oneAm = new Date("2026-10-07T05:00:00.000Z"); // 1 AM Wednesday
    const rows = selectComingDayEvents([
      listing({ title: "Wednesday Jam", starts_at: "2026-10-07T23:00:00.000Z", last_verified_at: "2026-10-07T04:00:00.000Z" }),
      listing({ title: "Thursday Jam", starts_at: "2026-10-08T23:00:00.000Z", last_verified_at: "2026-10-07T04:00:00.000Z" }),
      listing({ title: "Small Hours Set", starts_at: "2026-10-07T06:00:00.000Z", last_verified_at: "2026-10-07T04:00:00.000Z" }),
    ], oneAm);
    expect(rows.map((row) => row.title)).toEqual(["Wednesday Jam"]);
  });
});

describe("comingDayWeatherSentence", () => {
  it("writes one complete sentence that suits tomorrow and later today", () => {
    const now = new Date("2026-07-09T03:00:00.000Z"); // 11 PM Jul 8
    expect(comingDayWeatherSentence(
      daily([{ startTime: "2026-07-09T08:00:00-04:00", isDaytime: true, temperature: 84, shortForecast: "Mostly Sunny" }]),
      now,
    )).toBe("The forecast high is 84°, with mostly sunny skies.");
    expect(comingDayWeatherSentence(null, now)).toBeNull();
  });

  it("reads today's daytime period between midnight and 5 AM", () => {
    const oneAm = new Date("2026-07-09T05:00:00.000Z"); // 1 AM Jul 9
    const forecast = daily([
      { startTime: "2026-07-09T06:00:00-04:00", isDaytime: true, temperature: 81, shortForecast: "Chance Showers" },
      { startTime: "2026-07-10T06:00:00-04:00", isDaytime: true, temperature: 90, shortForecast: "Sunny" },
    ]);
    expect(tomorrowDaytimeForecast(forecast, oneAm)?.temp).toBe(81);
    expect(comingDayWeatherSentence(forecast, oneAm)).toBe(
      "The forecast high is 81°, with rain possible.",
    );
  });
});
