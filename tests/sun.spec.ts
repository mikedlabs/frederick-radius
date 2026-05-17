import { describe, it, expect } from "vitest";
import { sunTimes, nextSunHint } from "@/lib/sun";

// Frederick, MD.
const LAT = 39.4138;
const LNG = -77.4106;

function nyHour(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(d),
  );
}
const dayLengthH = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;

describe("sunTimes", () => {
  // Solstices/equinox at noon UTC so the calendar day is unambiguous.
  const summer = new Date("2026-06-21T12:00:00Z");
  const winter = new Date("2026-12-21T12:00:00Z");

  it("returns all events and orders them correctly", () => {
    const t = sunTimes(summer, LAT, LNG);
    expect(t.sunrise).not.toBeNull();
    expect(t.sunset).not.toBeNull();
    expect(t.goldenMorningEnd).not.toBeNull();
    expect(t.goldenEveningStart).not.toBeNull();
    expect(t.dusk).not.toBeNull();
    // sunrise < golden-morning-end < golden-evening-start < sunset < dusk
    expect(+t.sunrise!).toBeLessThan(+t.goldenMorningEnd!);
    expect(+t.goldenMorningEnd!).toBeLessThan(+t.goldenEveningStart!);
    expect(+t.goldenEveningStart!).toBeLessThan(+t.sunset!);
    expect(+t.sunset!).toBeLessThan(+t.dusk!);
  });

  it("puts Frederick sunrise/sunset in a sane local-time band year-round", () => {
    for (const d of [summer, winter]) {
      const t = sunTimes(d, LAT, LNG);
      expect(nyHour(t.sunrise!)).toBeGreaterThanOrEqual(4);
      expect(nyHour(t.sunrise!)).toBeLessThanOrEqual(8);
      expect(nyHour(t.sunset!)).toBeGreaterThanOrEqual(16);
      expect(nyHour(t.sunset!)).toBeLessThanOrEqual(21);
    }
  });

  it("summer day is materially longer than winter day (seasonality is real)", () => {
    const s = sunTimes(summer, LAT, LNG);
    const w = sunTimes(winter, LAT, LNG);
    const summerLen = dayLengthH(s.sunrise!, s.sunset!);
    const winterLen = dayLengthH(w.sunrise!, w.sunset!);
    expect(summerLen).toBeGreaterThan(13.5); // ~14h 45m at this latitude
    expect(winterLen).toBeLessThan(10.5); // ~9h 25m
    expect(summerLen - winterLen).toBeGreaterThan(4);
  });

  it("is deterministic — same inputs, same output", () => {
    expect(sunTimes(summer, LAT, LNG)).toEqual(sunTimes(summer, LAT, LNG));
  });
});

describe("nextSunHint", () => {
  it("names the evening golden window when it is still ahead", () => {
    // Mid-afternoon in summer: golden hour is later today.
    const h = nextSunHint(new Date("2026-06-21T18:00:00Z"), LAT, LNG);
    expect(h?.label).toMatch(/Golden hour/);
    expect(h?.to).toBeInstanceOf(Date);
    expect(+h!.from).toBeLessThan(+h!.to!);
  });

  it("returns null in the dead of night (no filler)", () => {
    // ~3am ET (07:00 UTC) — nothing notable upcoming until daytime.
    const h = nextSunHint(new Date("2026-06-21T07:00:00Z"), LAT, LNG);
    expect(h).toBeNull();
  });
});
