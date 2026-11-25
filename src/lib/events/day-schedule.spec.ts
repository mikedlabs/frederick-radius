import { describe, expect, it } from "vitest";
import { buildDaySchedule } from "./day-schedule";

const event = (starts_at: string, ends_at = starts_at) => ({ starts_at, ends_at });
const timed = (start: string, end?: string) => event(`2026-11-24T${start}:00-05:00`, end ? `2026-11-24T${end}:00-05:00` : undefined);
const today = "2026-11-24";

describe("the Frederick event time rail", () => {
  it("uses one scale for the displayed events, exact minute positions and strictly intersecting sessions", () => {
    const a = timed("17:30", "19:00"), b = timed("18:15", "18:45"), c = timed("19:00", "20:00");
    const marks = buildDaySchedule([a, b, c], today);
    expect(marks.get(a)?.axis).toEqual(["5 PM", "8 PM"]);
    expect(marks.get(a)?.startPercent).toBeCloseTo(100 / 6);
    expect(marks.get(a)?.durationPercent).toBeCloseTo(50);
    const overlap = marks.get(a)!.overlaps;
    expect(overlap).toHaveLength(1);
    expect(overlap[0].startPercent).toBeCloseTo(100 * 75 / 180);
    expect(overlap[0].widthPercent).toBeCloseTo(100 / 6);
    expect(marks.get(b)?.description).toMatch(/6:15 PM to 6:45 PM.*1 other displayed event/);
    expect(marks.get(c)?.overlaps).toEqual([]);
    expect(buildDaySchedule([a, c], today).get(a)?.hasOverlap).toBe(false);
    expect(buildDaySchedule([a, a], today).get(a)?.hasOverlap).toBe(false);
  });

  it("shows a known start with a missing, equal or sentinel end as a point without inventing a conflict", () => {
    const start = timed("17:45"), sentinel = timed("08:15", "23:59"), invalidEnd = { ...start, ends_at: "" };
    const closed = timed("17:15", "18:30");
    const marks = buildDaySchedule([start, sentinel, invalidEnd, closed], today);
    for (const row of [start, sentinel, invalidEnd]) {
      expect(marks.get(row)?.durationPercent).toBeNull();
      expect(marks.get(row)?.description).toContain("end time not listed");
    }
    expect(marks.get(closed)?.hasOverlap).toBe(false);
  });

  it("omits all-day, date-only, long/multi-date, cancelled, invalid and unrelated day rows", () => {
    const unknown = [
      { ...timed("10:00", "12:00"), is_all_day: true }, timed("12:00", "23:59"), timed("00:00", "23:59"),
      event("2026-11-24T09:00:00-05:00", "2026-11-25T11:00:00-05:00"), event("bad"),
      event("2026-11-25T17:00:00-05:00"), { ...timed("18:00", "19:00"), status: "cancelled" as const },
    ];
    expect(buildDaySchedule(unknown, today).size).toBe(0);
  });

  it("requires evidence for ambiguous historical durations and retains an organizer-confirmed two-hour event", () => {
    const legacy = { ...timed("18:15", "20:15"), source: "dfp" };
    const published = { ...legacy, published_time: "range" as const };
    const missing = { ...legacy, published_time: "start" as const };
    const game = { ...timed("19:00", "22:00"), source: "frederick-keys" };
    const countyDate = { ...timed("12:00", "14:00"), source: "county" };
    const observed = buildDaySchedule([legacy, published, missing, game, countyDate], today);
    expect(observed.get(legacy)?.durationPercent).toBeNull();
    expect(observed.get(missing)?.durationPercent).toBeNull();
    expect(observed.get(game)?.durationPercent).toBeNull();
    expect(observed.get(published)!.durationPercent).toBeGreaterThan(0);
    expect(observed.has(countyDate)).toBe(false);
  });

  it("labels overnight and actual midnight clocks, including sessions carried into today", () => {
    const overnight = event("2026-11-24T23:30:00-05:00", "2026-11-25T01:15:00-05:00");
    const startAtMidnight = timed("00:00", "01:00");
    expect(buildDaySchedule([startAtMidnight], today).get(startAtMidnight)?.description).toContain("12:00 AM to 1:00 AM");
    const mark = buildDaySchedule([overnight], today).get(overnight)!;
    expect(mark.axis).toEqual(["11 PM", "Wed 2 AM"]);
    expect(mark.description).toContain("11:30 PM to Wed 1:15 AM");
    expect(buildDaySchedule([overnight], "2026-11-25").get(overnight)?.description).toContain("Tue 11:30 PM to 1:15 AM");
  });

  it("separates the two fall hours and uses real elapsed time across the spring jump", () => {
    const early = event("2026-11-01T01:00:00-04:00", "2026-11-01T01:30:00-04:00");
    const late = event("2026-11-01T01:00:00-05:00", "2026-11-01T01:30:00-05:00");
    const fall = buildDaySchedule([early, late], "2026-11-01");
    expect(fall.get(early)?.description).toContain("1:00 AM EDT");
    expect(fall.get(late)?.description).toContain("1:00 AM EST");
    expect(fall.get(late)!.startPercent - fall.get(early)!.startPercent).toBe(50);
    expect(fall.get(early)?.hasOverlap).toBe(false);
    const spring = event("2026-03-08T01:30:00-05:00", "2026-03-08T03:30:00-04:00");
    const mark = buildDaySchedule([spring], "2026-03-08").get(spring)!;
    expect(mark.durationPercent).toBe(50);
    expect(mark.description).toContain("1:30 AM EST to 3:30 AM EDT");
  });
});
