import { describe, it, expect } from "vitest";
import { liveDowntownShows } from "./live-downtown";

// Mid-season Thursday window: the seed Alive @ Five lineup is anchored at
// 2026-05-14, so a June "now" must resolve a real upcoming band, and the
// SilverVox festival (Jun 18–21) must still be live.
const NOW = new Date("2026-06-08T12:00:00-04:00");

describe("liveDowntownShows", () => {
  const shows = liveDowntownShows(NOW);

  it("surfaces the three flagship programs", () => {
    const series = shows.map((s) => s.series);
    expect(series).toContain("Alive @ Five");
    expect(series).toContain("The Weinberg");
    expect(series).toContain("SilverVox Fest");
  });

  it("anchors the rail with Alive @ Five, then the rest soonest-first", () => {
    expect(shows[0]?.series).toBe("Alive @ Five");
    const restTimes = shows.slice(1).map((s) => Date.parse(s.startsAt));
    expect(restTimes).toEqual([...restTimes].sort((a, b) => a - b));
  });

  it("gives Alive @ Five a real upcoming band (not the title scaffold)", () => {
    const alive = shows.find((s) => s.series === "Alive @ Five")!;
    expect(alive.act).not.toMatch(/alive @ five/i);
    expect(alive.act.length).toBeGreaterThan(2);
    expect(Date.parse(alive.startsAt)).toBeGreaterThanOrEqual(NOW.getTime() - 3_600_000);
    expect(alive.href).toMatch(/^\/events\//);
  });

  it("links the Weinberg to an in-app event detail", () => {
    const wein = shows.find((s) => s.series === "The Weinberg")!;
    expect(wein.href).toMatch(/^\/events\//);
    expect(wein.external).toBeFalsy();
  });

  it("ships SilverVox as a dated external festival row", () => {
    const sv = shows.find((s) => s.series === "SilverVox Fest")!;
    expect(sv.external).toBe(true);
    expect(sv.endsAt).toBeTruthy();
    expect(sv.href).toContain("silvervox");
  });

  it("drops SilverVox once the run has ended", () => {
    const after = liveDowntownShows(new Date("2026-07-01T12:00:00-04:00"));
    expect(after.map((s) => s.series)).not.toContain("SilverVox Fest");
  });
});
