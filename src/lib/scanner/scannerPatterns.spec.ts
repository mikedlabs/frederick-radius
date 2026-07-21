import { describe, it, expect } from "vitest";
import { cleanSpot, hourOf } from "./scannerPatterns";

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
