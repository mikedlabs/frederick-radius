import { describe, it, expect } from "vitest";
import { nextSunHint } from "./sun";

// Frederick, MD. Golden hour ~7:49 PM, sunset ~8:39 PM ET on 2026-06-20.
const LAT = 39.4143;
const LNG = -77.4105;

describe("nextSunHint — Eastern calendar day (the UTC-rollover fix)", () => {
  it("detects ACTIVE golden hour at 8:30 PM ET in June, when the UTC date has already rolled to the next day", () => {
    // 8:30 PM EDT on June 20 is 00:30 UTC June 21 — keying off the UTC date
    // would solve the wrong day and wrongly report null here.
    const hint = nextSunHint(new Date("2026-06-21T00:30:00Z"), LAT, LNG);
    expect(hint).not.toBeNull();
    expect(hint!.label).toBe("Golden hour now");
  });

  it("returns null after dark (10 PM ET)", () => {
    expect(nextSunHint(new Date("2026-06-21T02:00:00Z"), LAT, LNG)).toBeNull();
  });

  it("names the upcoming window in mid-afternoon (5 PM ET)", () => {
    const hint = nextSunHint(new Date("2026-06-20T21:00:00Z"), LAT, LNG);
    expect(hint?.label).toBe("Golden hour");
  });

  it("returns null before solar noon (no filler in the morning)", () => {
    expect(nextSunHint(new Date("2026-06-20T13:00:00Z"), LAT, LNG)).toBeNull(); // 9 AM ET
  });
});
