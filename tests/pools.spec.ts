/**
 * Pool open-now status — the seasonal logic behind the Today pools card.
 * Hours are the verified 2026 City of Frederick sheet (Diggs + Thomas). All
 * dates below are summer (EDT = UTC-4), so a UTC instant of 18:00 is 2 PM ET.
 */
import { describe, it, expect } from "vitest";
import { poolsStatus } from "@/lib/pools";

const diggs = (s: ReturnType<typeof poolsStatus>) =>
  s.pools.find((p) => p.slug === "william-r-diggs-memorial-swimming-pool")!;
const thomas = (s: ReturnType<typeof poolsStatus>) =>
  s.pools.find((p) => p.slug === "edward-p-thomas-memorial-pool-playground")!;

describe("poolsStatus", () => {
  it("renders nothing out of season (January)", () => {
    const s = poolsStatus(new Date(Date.UTC(2026, 0, 15, 18, 0)));
    expect(s.inSeason).toBe(false);
    expect(s.pools).toHaveLength(0);
  });

  it("full season weekday afternoon: both pools open", () => {
    // 2026-07-01 is a Wednesday; 18:00 UTC = 2 PM ET.
    const s = poolsStatus(new Date(Date.UTC(2026, 6, 1, 18, 0)));
    expect(s.inSeason).toBe(true);
    expect(s.anyOpen).toBe(true);
    expect(diggs(s).openNow).toBe(true);
    expect(diggs(s).line).toBe("Open now until 8 PM");
    expect(thomas(s).openNow).toBe(true);
  });

  it("full season weekday morning: Diggs opens 11, Thomas opens 12:30", () => {
    // 14:00 UTC = 10 AM ET, before either opens.
    const s = poolsStatus(new Date(Date.UTC(2026, 6, 1, 14, 0)));
    expect(diggs(s).openNow).toBe(false);
    expect(diggs(s).line).toBe("Opens 11 AM");
    expect(thomas(s).line).toBe("Opens 12:30 PM");
  });

  it("full season Sunday 11 AM: Diggs not open until 12:30 (Sunday hours)", () => {
    // 2026-07-05 is a Sunday; 15:00 UTC = 11 AM ET.
    const s = poolsStatus(new Date(Date.UTC(2026, 6, 5, 15, 0)));
    expect(diggs(s).openNow).toBe(false);
    expect(diggs(s).line).toBe("Opens 12:30 PM");
  });

  it("post season weekday: both closed today but still in season", () => {
    // 2026-08-26 is a Wednesday in the post window (before Labor Day Sep 7).
    const s = poolsStatus(new Date(Date.UTC(2026, 7, 26, 18, 0)));
    expect(s.inSeason).toBe(true);
    expect(s.anyOpen).toBe(false);
    expect(diggs(s).line).toBe("Closed today");
    expect(thomas(s).line).toBe("Closed today");
  });

  it("pre season Monday evening: open 4-7 PM window", () => {
    // 2026-06-15 is a Monday; 21:00 UTC = 5 PM ET.
    const s = poolsStatus(new Date(Date.UTC(2026, 5, 15, 21, 0)));
    expect(diggs(s).openNow).toBe(true);
    expect(diggs(s).line).toBe("Open now until 7 PM");
  });
});
