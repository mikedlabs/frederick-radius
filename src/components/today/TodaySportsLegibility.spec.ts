import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { KeysScore as Score } from "@/lib/integrations/keysScore";
import { KeysPregameMatchup } from "./KeysScore";

/** Every arbitrary pixel text size below the Today floor of 11px. */
function smallText(source: string): string[] {
  return Array.from(source.matchAll(/\btext-\[(\d+(?:\.\d+)?)px\]/g))
    .filter((match) => Number(match[1]) < 11)
    .map((match) => match[0]);
}

describe("Today sports cards", () => {
  it("keeps every visible size at 11px or larger", () => {
    // The scoreboard eyebrow and the Keys side labels rendered at 8 to 10px
    // on Today, below what a phone can read at arm's length.
    for (const file of [
      "src/components/today/LocalSportsScoreboard.tsx",
      "src/components/today/KeysScore.tsx",
    ]) {
      expect(smallText(readFileSync(file, "utf8")), file).toEqual([]);
    }
  });

  it("renders the Keys pregame matchup without sub-11px text", () => {
    const score: Score = {
      gamePk: 123,
      state: "pre",
      detailedState: "Scheduled",
      keysHome: true,
      keys: { name: "Frederick Keys", runs: null },
      opponent: { name: "West Virginia Black Bears", runs: null },
      inningOrdinal: null,
      inningState: null,
      outs: null,
      startsAt: "2026-07-26T23:05:00.000Z",
      url: "https://www.milb.com/frederick/schedule",
    };
    const html = renderToStaticMarkup(createElement(KeysPregameMatchup, { score }));

    expect(html).toContain("First pitch");
    expect(smallText(html)).toEqual([]);
  });

  it("draws the On now disclosure rule in the border token, not Ink", () => {
    const band = readFileSync("src/components/today/OnNowBand.tsx", "utf8");
    // A bare border-t is currentColor under Tailwind v4. today-disclosure
    // supplies var(--app-border), matching the page-level disclosures.
    expect(band).toContain('className="today-disclosure border-t pt-1');
  });
});
