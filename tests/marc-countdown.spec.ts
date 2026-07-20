import { describe, it, expect } from "vitest";
import { marcCountdownMins } from "@/lib/integrations/marcTrains";

/**
 * marcCountdownMins is the schedule/delay-derived countdown for the transit
 * hero. It mirrors NextStopsBoard's etaMins: read the client clock (nowMs)
 * against the departure epoch (seconds), and suppress anything it cannot state
 * honestly so the caller shows a clock time instead.
 */
describe("marcCountdownMins", () => {
  const now = 1_700_000_000_000; // fixed client clock in ms

  it("returns whole minutes until the departure epoch", () => {
    expect(marcCountdownMins(now / 1000 + 14 * 60, now)).toBe(14);
    expect(marcCountdownMins(now / 1000, now)).toBe(0);
    expect(marcCountdownMins(now / 1000 + 90 * 60, now)).toBe(90);
  });

  it("suppresses missing, un-ticked, past, and implausible values", () => {
    expect(marcCountdownMins(undefined, now)).toBeNull();
    expect(marcCountdownMins(now / 1000 + 600, 0)).toBeNull(); // clock has not ticked
    expect(marcCountdownMins(now / 1000 - 120, now)).toBeNull(); // already departed
    expect(marcCountdownMins(now / 1000 + 25 * 60 * 60, now)).toBeNull(); // more than a day out
  });
});
