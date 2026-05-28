import { describe, it, expect } from "vitest";
import {
  etNowParts,
  activeServiceIds,
  nextScheduled,
} from "@/lib/integrations/marcTrains";
import { MARC_STATIONS, stationForStopId, MARC_STOP_IDS } from "@/data/marc-stations";

describe("MARC station data", () => {
  it("has the four county stations with eb/wb stop ids", () => {
    expect(MARC_STATIONS.map((s) => s.key).sort()).toEqual([
      "brunswick",
      "frederick",
      "monocacy",
      "point-of-rocks",
    ]);
    expect(MARC_STOP_IDS.size).toBe(8);
  });

  it("resolves a stop id to its station and direction", () => {
    expect(stationForStopId("11944")).toMatchObject({
      direction: "eb",
      station: { key: "frederick" },
    });
    expect(stationForStopId("11972")).toMatchObject({ direction: "wb" });
    expect(stationForStopId("99999")).toBeUndefined();
  });
});

describe("etNowParts", () => {
  it("converts a summer instant to Eastern (EDT, -4)", () => {
    const p = etNowParts(new Date("2026-07-16T14:30:00Z")); // 10:30 EDT
    expect(p.ymd).toBe("20260716");
    expect(p.minutes).toBe(10 * 60 + 30);
    expect(p.weekday).toBeGreaterThanOrEqual(0);
    expect(p.weekday).toBeLessThanOrEqual(6);
  });

  it("converts a winter instant to Eastern (EST, -5)", () => {
    const p = etNowParts(new Date("2026-01-15T14:30:00Z")); // 09:30 EST
    expect(p.ymd).toBe("20260115");
    expect(p.minutes).toBe(9 * 60 + 30);
  });

  it("rolls the service date back for an after-midnight UTC instant", () => {
    // 2026-05-28T03:00:00Z is 11:00 PM EDT on the 27th.
    const p = etNowParts(new Date("2026-05-28T03:00:00Z"));
    expect(p.ymd).toBe("20260527");
    expect(p.minutes).toBe(23 * 60);
  });
});

describe("activeServiceIds (real schedule)", () => {
  // 101B is the Brunswick weekday service (Mon-Fri) seen in the data.
  it("includes weekday service on a weekday, not on a weekend", () => {
    // 2026-05-28 is a Thursday → weekday index 3.
    const thu = activeServiceIds("20260528", 3);
    expect(thu.has("101B")).toBe(true);
    // 2026-05-30 is a Saturday → weekday index 5.
    const sat = activeServiceIds("20260530", 5);
    expect(sat.has("101B")).toBe(false);
  });

  it("excludes a service outside its date range", () => {
    // Far future, past every calendar end_date (2026-12-31).
    const future = activeServiceIds("20300101", 0);
    expect(future.has("101B")).toBe(false);
  });
});

describe("nextScheduled (Frederick eb, real schedule)", () => {
  const FRED_EB = "11944";

  it("returns the morning trains in order from start of day", () => {
    const active = activeServiceIds("20260528", 3); // Thursday
    const deps = nextScheduled(FRED_EB, 0, active, 5);
    expect(deps.length).toBeGreaterThan(0);
    // Sorted ascending by minute.
    const mins = deps.map((d) => d.min);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
    // Frederick is a morning-commute spur; first train is early.
    expect(deps[0].min).toBeLessThan(8 * 60);
  });

  it("only returns departures at or after the given time", () => {
    const active = activeServiceIds("20260528", 3);
    const deps = nextScheduled(FRED_EB, 6 * 60 + 30, active, 5); // 6:30am
    expect(deps.every((d) => d.min >= 6 * 60 + 30)).toBe(true);
  });

  it("returns nothing after the last morning train", () => {
    const active = activeServiceIds("20260528", 3);
    const deps = nextScheduled(FRED_EB, 23 * 60, active, 5); // 11pm
    expect(deps).toEqual([]);
  });

  it("never returns two departures with the same time and headsign", () => {
    const active = activeServiceIds("20260528", 3);
    const deps = nextScheduled(FRED_EB, 0, active, 10);
    const keys = deps.map((d) => `${d.t}|${d.headsign}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
