import { describe, it, expect } from "vitest";
import { cleanSpot, dedupeCalls, hourOf, roadKey } from "./scannerPatterns";
import type { PatternRecord } from "./scannerPatterns";
import trafficCounts from "@/data/traffic-counts.json";

describe("cleanSpot — road-level hotspot key", () => {
  it("drops the house-range block number down to the road", () => {
    expect(cleanSpot("12200 block Coppermine Rd")).toBe("Coppermine Rd");
  });

  it("drops the landmark tail after the comma", () => {
    expect(cleanSpot("200 block N Market St, Bloom Asian Haus")).toBe("N Market St");
  });

  it("folds highway direction tokens so both ways count as one road", () => {
    expect(cleanSpot("Rt15sb")).toBe("Route 15");
    expect(cleanSpot("Rt15sb and Mountaindale Rd")).toBe("Route 15 and Mountaindale Rd");
    expect(cleanSpot("I70eb")).toBe("I-70");
  });

  it("rewrites an intersection slash to 'and'", () => {
    expect(cleanSpot("FSK Highway / Middleburg Rd")).toBe("FSK Highway and Middleburg Rd");
  });

  it("drops mangled ramp/marker blurbs rather than guessing", () => {
    expect(cleanSpot("Rt18100 Block To Rt34100 Blockeb -pete Ramp")).toBeNull();
    expect(cleanSpot("")).toBeNull();
  });

  it("never leaks a house number into the road key", () => {
    const spot = cleanSpot("700 block E Potomac St");
    expect(spot).toBe("E Potomac St");
    expect(spot).not.toMatch(/\d/);
  });
});

describe("roadKey — road name to traffic-lookup key", () => {
  it("normalizes suffixes and case to match the baked lookup", () => {
    expect(roadKey("Ballenger Creek Pike")).toBe("BALLENGER CREEK PIKE");
    expect(roadKey("Liberty Road")).toBe("LIBERTY RD");
    expect(roadKey("Mountaindale Rd")).toBe("MOUNTAINDALE RD");
  });
  it("actually resolves a known hotspot road in the baked traffic data", () => {
    const t = trafficCounts as Record<string, number>;
    expect(t[roadKey("Ballenger Creek Pike")]).toBeGreaterThan(0);
  });
});

describe("traffic-counts.json — no survey-year contamination", () => {
  const t = trafficCounts as Record<string, number>;
  it("carries no bare survey year as an AADT value", () => {
    // The source scrape mixed the survey YEAR (2014/2015/2016) into the count
    // column for 85 roads. A fake ~2016 denominator inflates a real crash load
    // into a phantom top-of-card hotspot, so those entries were dropped.
    const yearlike = Object.entries(t).filter(([, v]) => v >= 2013 && v <= 2018);
    expect(yearlike).toEqual([]);
  });
  it("every value is a positive integer", () => {
    for (const [road, v] of Object.entries(t)) {
      expect(Number.isInteger(v), `${road}=${v}`).toBe(true);
      expect(v, road).toBeGreaterThan(0);
    }
  });
});

describe("dedupeCalls — repeated dispatch posts collapse to one call", () => {
  const HR = 60 * 60 * 1000;
  const rec = (kind: PatternRecord["kind"], location: string, atMs: number | null): PatternRecord => ({
    kind,
    location,
    roadImpact: kind === "Crash",
    atMs,
    hour: null,
    dateKey: "",
  });

  it("folds reposts of one working call within the repost window", () => {
    const t = 1_700_000_000_000;
    const out = dedupeCalls([
      rec("Crash", "100 block Main St", t),
      rec("Crash", "100 block Main St", t + 7 * 60_000), // +7 min, same call
      rec("Crash", "100 block Main St", t + 20 * 60_000), // +20 min, same call
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].atMs).toBe(t); // earliest post represents the call
  });

  it("keeps two real crashes on the same road far apart as two calls", () => {
    const t = 1_700_000_000_000;
    const out = dedupeCalls([
      rec("Crash", "100 block Main St", t),
      rec("Crash", "100 block Main St", t + 6 * HR), // a separate crash hours later
    ]);
    expect(out).toHaveLength(2);
  });

  it("does not merge different kinds or different locations", () => {
    const t = 1_700_000_000_000;
    const out = dedupeCalls([
      rec("Crash", "100 block Main St", t),
      rec("Wires down", "100 block Main St", t + 60_000),
      rec("Crash", "200 block Main St", t + 60_000),
    ]);
    expect(out).toHaveLength(3);
  });
});

describe("hourOf — clock to hour of day", () => {
  it("maps am/pm clock strings to 0–23", () => {
    expect(hourOf("7:23 pm")).toBe(19);
    expect(hourOf("12:40 pm")).toBe(12);
    expect(hourOf("12:15 am")).toBe(0);
    expect(hourOf("9:10 am")).toBe(9);
  });
  it("returns null for a non-clock string", () => {
    expect(hourOf("soon")).toBeNull();
    expect(hourOf("")).toBeNull();
  });
});
