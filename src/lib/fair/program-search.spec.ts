import { describe, expect, it } from "vitest";
import { fairProgramSearchMatches } from "./program-search";

const item = { date: "2026-09-23", title: "Bluey", detail: "Character visit", placeLabel: "Home Arts & Crafts (Building 9)", timeLabel: "1–3 p.m." };

describe("Fair program search scope", () => {
  it("keeps the selected day explicit unless all days is requested", () => {
    expect(fairProgramSearchMatches(item, "Bluey", "2026-09-21", "day")).toBe(false);
    expect(fairProgramSearchMatches(item, "Bluey", "2026-09-21", "all")).toBe(true);
    expect(fairProgramSearchMatches(item, "", item.date, "day")).toBe(true);
  });
  it("matches words across title and published place, in either order", () => {
    expect(fairProgramSearchMatches(item, "building 9 bluey", item.date, "all")).toBe(true);
    expect(fairProgramSearchMatches(item, "Bluey grandstand", item.date, "all")).toBe(false);
  });
  it("normalizes punctuation and accents without inventing synonyms", () => {
    expect(fairProgramSearchMatches({ ...item, title: "Funky Joe’s Café" }, "funky joe's cafe", item.date, "all")).toBe(true);
    expect(fairProgramSearchMatches(item, "music", item.date, "all", "Concert & music")).toBe(true);
    expect(fairProgramSearchMatches(item, "pirate", item.date, "all")).toBe(false);
  });
});
