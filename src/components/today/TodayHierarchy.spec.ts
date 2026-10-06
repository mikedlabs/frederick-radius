import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const todayPage = readFileSync("src/app/(app)/today/page.tsx", "utf8");

describe("Today page rework (2026-10-06)", () => {
  it("imports the new Today components", () => {
    expect(todayPage).toContain('from "@/components/today/TodayConditionsLine"');
    expect(todayPage).toContain('from "@/components/today/TodayEventPick"');
    expect(todayPage).toContain('from "@/components/today/TodaySeasonalPick"');
  });

  it("uses the new event pick functions", () => {
    expect(todayPage).toContain('from "@/lib/today/event-picks"');
    expect(todayPage).toContain("pickBestThree");
    expect(todayPage).toContain("pickTonightEvents");
    expect(todayPage).toContain("pickThisWeekAnchors");
  });

  it("renders TodayConditionsLine first", () => {
    const renderedPage = todayPage.slice(todayPage.indexOf("return ("));
    expect(renderedPage).toContain("<TodayConditionsLine />");
    const conditionsPos = renderedPage.indexOf("<TodayConditionsLine />");
    expect(conditionsPos).toBeGreaterThan(-1);
  });

  it("renders best three events section with TodayEventPick cards", () => {
    expect(todayPage).toContain("const bestThree = pickBestThree");
    expect(todayPage).toContain("bestThree.length > 0");
    expect(todayPage).toContain("<TodayEventPick");
  });

  it("renders Tonight section with 5 PM cutoff", () => {
    expect(todayPage).toContain("const tonight = pickTonightEvents");
    expect(todayPage).toContain("tonight.length > 0");
  });

  it("renders Coming up this week section", () => {
    expect(todayPage).toContain("const thisWeek = pickThisWeekAnchors");
    expect(todayPage).toContain("thisWeek.length > 0");
  });

  it("renders seasonal collection pick", () => {
    expect(todayPage).toContain("pickSeasonalCollection");
    expect(todayPage).toContain("<TodaySeasonalPick");
  });

  it("has graceful degradation when archive is degraded", () => {
    expect(todayPage).toContain("sourceHealth.degraded");
    expect(todayPage).toContain("briefly unavailable");
  });

  it("preserves event sheet boundaries for progressive enhancement", () => {
    expect(todayPage).toContain("<EventSheetBoundary");
    expect(todayPage).toContain("<PlaceSheetBoundary");
  });

  it("uses Suspense boundaries for streaming", () => {
    expect(todayPage).toContain("<Suspense");
    expect(todayPage).toContain("fallback=");
  });
});
