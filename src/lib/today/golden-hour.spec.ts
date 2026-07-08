import { describe, it, expect } from "vitest";
import { goldenHourWindow } from "./golden-hour";
import { sunTimes } from "@/lib/sun";
import { FREDERICK_CENTER } from "@/lib/geo";

const { lat, lng } = FREDERICK_CENTER;
// A summer day with a late sunset, so the window is comfortably in the evening.
const DAY = new Date("2026-07-08T12:00:00.000Z");
const t = sunTimes(DAY, lat, lng);
const goldenStart = t.goldenEveningStart!;
const sunset = t.sunset!;

describe("goldenHourWindow — only the pre-sunset window earns the card", () => {
  it("returns null in the dead of night and the middle of the day", () => {
    expect(goldenHourWindow(new Date(goldenStart.getTime() - 6 * 3_600_000), lat, lng)).toBeNull(); // early afternoon
    expect(goldenHourWindow(new Date(sunset.getTime() + 6 * 3_600_000), lat, lng)).toBeNull(); // well after dark
  });

  it("is null more than 90 min before golden hour, then opens inside the lead-in", () => {
    expect(goldenHourWindow(new Date(goldenStart.getTime() - 120 * 60_000), lat, lng)).toBeNull();
    const soon = goldenHourWindow(new Date(goldenStart.getTime() - 60 * 60_000), lat, lng);
    expect(soon).not.toBeNull();
    expect(soon!.active).toBe(false); // "soon", not yet underway
  });

  it("is active once golden hour is underway, through sunset", () => {
    const win = goldenHourWindow(new Date(goldenStart.getTime() + 5 * 60_000), lat, lng);
    expect(win).not.toBeNull();
    expect(win!.active).toBe(true);
    expect(win!.sunset.getTime()).toBe(sunset.getTime());
    expect(win!.goldenStart.getTime()).toBeLessThanOrEqual(win!.sunset.getTime());
  });

  it("closes exactly at sunset (no light left to promise)", () => {
    expect(goldenHourWindow(new Date(sunset.getTime() + 60_000), lat, lng)).toBeNull();
  });
});
