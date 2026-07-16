import { describe, expect, it } from "vitest";
import { todayPrompts } from "@/lib/today-prompts";

describe("todayPrompts", () => {
  it("prioritizes cooling help during dangerous heat", () => {
    const prompts = todayPrompts({ hour: 13, temperature: 96 });
    expect(prompts.map((item) => item.label)).toEqual([
      "Indoor nearby",
      "Drinking water nearby",
      "Cool dinner later",
    ]);
    expect(prompts[1].query).toContain("drinking water");
  });

  it("offers weather-appropriate ideas when rain is likely", () => {
    expect(todayPrompts({ hour: 10, temperature: 72, precipitation: 70 }).map((item) => item.label)).toContain("Rainy-day plan");
  });

  it("switches to dinner and events in the evening", () => {
    expect(todayPrompts({ hour: 19, temperature: 78 }).map((item) => item.label)).toEqual([
      "Dinner nearby",
      "What’s on tonight",
      "Build a date night",
    ]);
  });
});
