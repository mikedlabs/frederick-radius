import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CivicPressItem } from "@/lib/integrations/civic-press";
import { PoliceBreakingStrip } from "./CivicPress";

const NOW = Date.parse("2026-07-21T20:00:00.000Z");

function item(title: string, ageHours: number): CivicPressItem {
  return {
    title,
    url: "https://example.gov/release",
    source: "City of Frederick",
    sourceShort: "City",
    publishedAt: new Date(NOW - ageHours * 3_600_000).toISOString(),
    lane: "police",
  };
}

describe("PoliceBreakingStrip", () => {
  it("renders nothing for a routine release", () => {
    const html = renderToStaticMarkup(createElement(PoliceBreakingStrip, {
      item: item("Frederick Police Announces National Night Out", 1),
      now: NOW,
    }));

    expect(html).toBe("");
  });

  it("renders a fresh urgent release", () => {
    const urgent = item("Frederick Police Investigate Shooting", 1);
    const html = renderToStaticMarkup(createElement(PoliceBreakingStrip, {
      item: urgent,
      now: NOW,
    }));

    expect(html).toContain("Breaking");
    expect(html).toContain(urgent.title);
  });
});
