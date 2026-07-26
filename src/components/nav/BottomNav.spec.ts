import { describe, expect, it } from "vitest";
import { shouldShowBottomNav } from "./BottomNav";

describe("BottomNav contextual chrome", () => {
  it("yields the bottom edge to detail actions and the focused Ask workspace", () => {
    expect(shouldShowBottomNav("/places/gravel-and-grind", true)).toBe(false);
    expect(shouldShowBottomNav("/events/alive-at-five-2026", true)).toBe(false);
    expect(shouldShowBottomNav("/ask")).toBe(false);
    expect(shouldShowBottomNav("/ask/history")).toBe(false);
  });

  it("stays present whenever a contextual bar was not actually rendered", () => {
    expect(shouldShowBottomNav("/today")).toBe(true);
    expect(shouldShowBottomNav("/map")).toBe(true);
    expect(shouldShowBottomNav("/events")).toBe(true);
    expect(shouldShowBottomNav("/events/calendar")).toBe(true);
    expect(shouldShowBottomNav("/events/missing-event")).toBe(true);
    expect(shouldShowBottomNav("/my-radius")).toBe(true);
  });
});
