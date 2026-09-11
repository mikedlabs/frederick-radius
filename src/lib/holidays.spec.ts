import { describe, it, expect } from "vitest";
import { holidayOn } from "@/lib/holidays";

// Noon Eastern on a given date (EDT = -04:00 summer, EST = -05:00 winter).
const edt = (iso: string) => new Date(`${iso}T12:00:00-04:00`);
const est = (iso: string) => new Date(`${iso}T12:00:00-05:00`);

describe("holidayOn", () => {
  it("identifies Juneteenth on June 19", () => {
    const h = holidayOn(edt("2026-06-19"));
    expect(h?.name).toBe("Juneteenth");
    expect(h?.observed).toBeFalsy();
  });

  it("returns null on a non-holiday", () => {
    expect(holidayOn(edt("2026-06-18"))).toBeNull();
    expect(holidayOn(edt("2026-03-12"))).toBeNull();
  });

  it("computes nth-weekday holidays for 2026", () => {
    expect(holidayOn(est("2026-01-19"))?.name).toBe("Martin Luther King Jr. Day"); // 3rd Mon Jan
    expect(holidayOn(est("2026-02-16"))?.name).toBe("Presidents' Day"); // 3rd Mon Feb
    expect(holidayOn(edt("2026-05-25"))?.name).toBe("Memorial Day"); // last Mon May
    expect(holidayOn(edt("2026-09-07"))?.name).toBe("Labor Day"); // 1st Mon Sep
    expect(holidayOn(edt("2026-10-12"))?.name).toBe("Indigenous Peoples' Day"); // 2nd Mon Oct
    expect(holidayOn(est("2026-11-26"))?.name).toBe("Thanksgiving"); // 4th Thu Nov
  });

  it("identifies fixed-date federal holidays", () => {
    expect(holidayOn(est("2026-01-01"))?.name).toBe("New Year's Day");
    expect(holidayOn(est("2026-11-11"))?.name).toBe("Veterans Day");
    expect(holidayOn(est("2026-12-25"))?.name).toBe("Christmas Day");
  });

  it("applies the weekend observed shift", () => {
    // New Year's Day 2022 fell on a Saturday → observed Friday Dec 31, 2021.
    const observed = holidayOn(est("2021-12-31"));
    expect(observed?.name).toBe("New Year's Day");
    expect(observed?.observed).toBe(true);
    // Juneteenth 2021 fell on a Saturday → observed Friday June 18.
    const jn = holidayOn(edt("2021-06-18"));
    expect(jn?.name).toBe("Juneteenth");
    expect(jn?.observed).toBe(true);
    // And the actual Saturday date still reads as the holiday (not observed).
    expect(holidayOn(edt("2021-06-19"))?.observed).toBeFalsy();
  });

  it("carries a closures line", () => {
    expect(holidayOn(edt("2026-06-19"))?.closures).toMatch(/closed/i);
  });
});
