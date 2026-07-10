import { describe, expect, it } from "vitest";
import { goldenPushDecision } from "./golden-push";
import { goldenHourWindow } from "@/lib/today/golden-hour";
import { FREDERICK_LAT, FREDERICK_LNG } from "@/lib/almanac";

/**
 * Anchor the band tests to the REAL golden start for a fixed date, so the
 * spec never depends on hardcoded sun times drifting from the NOAA math.
 */
function goldenStartOn(dayIsoNoon: string): Date {
  const w = goldenHourWindow(new Date(dayIsoNoon), FREDERICK_LAT, FREDERICK_LNG);
  // goldenHourWindow returns null at noon (too early); recompute from a
  // time inside the lead window instead: ask 80 minutes before sunset-ish
  // by probing forward in 10-minute steps until it opens.
  if (w) return w.goldenStart;
  const base = new Date(dayIsoNoon);
  for (let i = 0; i < 60; i++) {
    const probe = new Date(base.getTime() + i * 10 * 60_000);
    const pw = goldenHourWindow(probe, FREDERICK_LAT, FREDERICK_LNG);
    if (pw) return pw.goldenStart;
  }
  throw new Error("no golden window found for test day");
}

describe("goldenPushDecision", () => {
  // A midsummer and a midwinter day exercise both DST regimes.
  for (const day of ["2026-07-10T16:00:00Z", "2026-01-15T17:00:00Z"]) {
    const golden = goldenStartOn(day);

    it(`sends inside the band (${day.slice(0, 10)})`, () => {
      const now = new Date(golden.getTime() - 25 * 60_000);
      const d = goldenPushDecision(now);
      expect(d.send).toBe(true);
      if (d.send) {
        expect(d.title).toMatch(/^Golden hour at \d{1,2}:\d{2}(am|pm)$/);
        expect(d.body).toContain("sunset");
        expect(d.dedupeKey).toMatch(/^golden:\d{4}-\d{2}-\d{2}$/);
      }
    });

    it(`stays quiet too far ahead (${day.slice(0, 10)})`, () => {
      const now = new Date(golden.getTime() - 70 * 60_000);
      expect(goldenPushDecision(now).send).toBe(false);
    });

    it(`stays quiet once underway (${day.slice(0, 10)})`, () => {
      const now = new Date(golden.getTime() + 5 * 60_000);
      expect(goldenPushDecision(now).send).toBe(false);
    });
  }

  it("stays quiet in the middle of the day", () => {
    expect(goldenPushDecision(new Date("2026-07-10T16:00:00Z")).send).toBe(false);
  });

  it("stays quiet after dark", () => {
    expect(goldenPushDecision(new Date("2026-07-11T03:00:00Z")).send).toBe(false);
  });

  it("15-minute cron cadence always lands at least one tick in the band", () => {
    const golden = goldenStartOn("2026-07-10T16:00:00Z");
    // Simulate ticks at every possible 15-minute phase offset.
    for (let phase = 0; phase < 15; phase++) {
      let hits = 0;
      for (let m = 0; m < 24 * 60; m += 15) {
        const tick = new Date(
          Date.UTC(2026, 6, 10, 0, phase, 0) // phase-shifted quarter-hour grid
        );
        tick.setUTCMinutes(tick.getUTCMinutes() + m);
        if (goldenPushDecision(tick).send) hits++;
      }
      expect(hits).toBeGreaterThanOrEqual(1);
    }
    void golden;
  });
});
