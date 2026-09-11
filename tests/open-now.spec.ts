import { describe, it, expect } from "vitest";
import { isOpenNow, type OpenStatus } from "@/lib/hours";

/**
 * isOpenNow is the single source of truth for "open right now" across
 * the map readout, the radius instrument, the browse filter, /today
 * filters, and the briefing count. The honesty contract: only verified
 * states count as open; "unverified" and "unknown" never do, so no
 * surface ever over-asserts that a place is open.
 */
describe("isOpenNow", () => {
  it("counts 'open' as open", () => {
    const s: OpenStatus = { state: "open", closesAt: "21:00", closingSoon: false };
    expect(isOpenNow(s)).toBe(true);
  });

  it("counts 'closing-soon' as open (still open right now)", () => {
    const s: OpenStatus = { state: "closing-soon", closesAt: "21:00" };
    expect(isOpenNow(s)).toBe(true);
  });

  it("does not count 'closed'", () => {
    expect(isOpenNow({ state: "closed" })).toBe(false);
  });

  it("never counts 'unverified' (honesty: hours present but unconfirmed)", () => {
    expect(isOpenNow({ state: "unverified" })).toBe(false);
  });

  it("never counts 'unknown' (no hours data)", () => {
    expect(isOpenNow({ state: "unknown" })).toBe(false);
  });
});
