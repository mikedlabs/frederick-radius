import { describe, expect, it } from "vitest";
import { mayUseLikelyOpenFallback } from "./likely-open";

describe("mayUseLikelyOpenFallback", () => {
  it("fills only unknown or unverified availability", () => {
    expect(mayUseLikelyOpenFallback({ state: "unknown" })).toBe(true);
    expect(mayUseLikelyOpenFallback({ state: "unverified" })).toBe(true);
  });

  it("never overrides a confirmed open or closed state", () => {
    expect(
      mayUseLikelyOpenFallback({
        state: "open",
        closesAt: "21:00",
        closingSoon: false,
      }),
    ).toBe(false);
    expect(
      mayUseLikelyOpenFallback({
        state: "closing-soon",
        closesAt: "18:00",
      }),
    ).toBe(false);
    expect(
      mayUseLikelyOpenFallback({
        state: "closed",
        opensAt: "09:00",
        opensDay: "mon",
        opensToday: false,
      }),
    ).toBe(false);
  });
});
