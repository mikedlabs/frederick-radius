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

  it("keeps find tools below the event sections", () => {
    const eventsPos = todayPage.indexOf("<EventsSections");
    const toolsPos = todayPage.indexOf('aria-label="Find a place or service"');
    const askPos = todayPage.indexOf("<TodayAsk");
    expect(eventsPos).toBeGreaterThan(-1);
    expect(toolsPos).toBeGreaterThan(eventsPos);
    expect(askPos).toBeGreaterThan(toolsPos);
  });

  it("renders the first today pick as a lead card", () => {
    expect(todayPage).toContain('variant={index === 0 ? "lead" : "compact"}');
  });

  it("filters campus and notice through one local Today-scope helper", () => {
    expect(todayPage).toContain("eventHiddenFromToday");
    expect(todayPage).not.toContain("eventScope");
  });

  it("routes Free labels through one local helper, not raw is_free", () => {
    const pick = readFileSync("src/components/today/TodayEventPick.tsx", "utf8");
    const headline = readFileSync("src/components/today/TonightHeadline.tsx", "utf8");
    const copy = readFileSync("src/lib/today/event-copy.ts", "utf8");
    const picks = readFileSync("src/lib/today/event-picks.ts", "utf8");
    const recovery = readFileSync("src/lib/today-events.ts", "utf8");
    expect(copy).toContain("eventFreeStatus");
    expect(picks).toContain("eventFreeStatus");
    expect(headline).toContain("eventFreeStatus");
    expect(recovery).toContain("eventFreeStatus");
    expect(pick).not.toMatch(/\.is_free\b/);
    expect(headline).not.toMatch(/\.is_free\b/);
    expect(picks).not.toMatch(/event\.is_free\b/);
    expect(recovery).not.toMatch(/event\.is_free\b/);
  });

  it("keeps Find below events and out of the chatbot register", () => {
    expect(todayPage).not.toContain("What do you need?");
    expect(todayPage).not.toContain("PageBloom");
    expect(todayPage).not.toMatch(/newsletter|sign-?up|email prompt/i);
    expect(todayPage).toContain("TodayListLink");
  });
});
